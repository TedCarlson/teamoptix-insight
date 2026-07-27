import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processCapturedManifestArtifacts } from "@/features/operations/manifests/manifest.processor";
import { manifestIdentityFromBuffer } from "@/features/operations/manifests/manifest.identity";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function isRunnerAuthorized(req: NextRequest) {
  const configured = process.env.INSIGHT_ARTIFACT_INGEST_TOKEN ?? "";
  const supplied = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );
  if (!configured || !supplied) return false;
  const configuredBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    configuredBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(configuredBuffer, suppliedBuffer)
  );
}

function isCronAuthorized(req: NextRequest) {
  const configured = process.env.CRON_SECRET;
  return Boolean(
    configured &&
      req.headers.get("authorization") === `Bearer ${configured}`
  );
}

function parseLimit(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? "10");

  if (!Number.isFinite(raw)) return 10;

  return Math.max(1, Math.min(25, Math.trunc(raw)));
}

function isManifestCollectionArtifact(row: any) {
  return ["Delivery Manifest.xlsx", "Pickup Manifest.xlsx"].includes(row.normalized_filename);
}

function expectedManifestType(row: any) {
  return row.normalized_filename === "Delivery Manifest.xlsx" ? "delivery" : "pickup";
}

async function prepareManifestCollectionArtifacts(
  supabase: any,
  limit: number,
  collectionRequestId: string | null
) {
  let artifactQuery = supabase
    .from("operations_collection_artifact_v")
    .select("*")
    .eq("artifact_kind", "REPORT_FILE")
    .in("artifact_status", ["READY_FOR_INGEST", "FAILED"])
    .in("normalized_filename", ["Delivery Manifest.xlsx", "Pickup Manifest.xlsx"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 250)));

  if (collectionRequestId) {
    artifactQuery = artifactQuery.eq(
      "collection_request_id",
      collectionRequestId
    );
  }

  const { data: artifacts, error } = await artifactQuery;

  if (error) throw new Error(error.message);

  const prepared = [];
  for (const artifact of (artifacts ?? []).filter(isManifestCollectionArtifact)) {
    const failedByPromotion = artifact.artifact_status === "FAILED" &&
      artifact.ingest_metadata_json?.source === "promote_operations_collection_manifest_artifacts";
    if (artifact.artifact_status === "FAILED" && !failedByPromotion) continue;

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(artifact.storage_bucket)
        .download(artifact.storage_path);
      if (downloadError || !blob) throw new Error(downloadError?.message ?? "Manifest artifact was not readable.");

      const identity = manifestIdentityFromBuffer(Buffer.from(await blob.arrayBuffer()));
      const expectedType = expectedManifestType(artifact);
      if (identity.manifest_type !== expectedType) {
        throw new Error(`Manifest identity mismatch: artifact expects ${expectedType}, Header identifies ${identity.manifest_type}.`);
      }
      if (artifact.service_date && artifact.service_date !== identity.service_date) {
        throw new Error(`Manifest identity mismatch: artifact date ${artifact.service_date}, Header date ${identity.service_date}.`);
      }

      const runnerArtifact = {
        ...(artifact.runner_artifact_json ?? {}),
        artifact_key: identity.manifest_type === "delivery" ? "DELIVERY_MANIFEST" : "PICKUP_MANIFEST",
        manifest_type: identity.manifest_type,
        service_date: identity.service_date,
        service_area: identity.service_area,
        route_key: identity.route_key,
        route_label: identity.route_label,
        header_work_area: identity.raw_work_area,
        header_page: identity.source_page,
        source_download_filename: artifact.runner_artifact_json?.source_download_filename ?? artifact.original_filename,
        canonical_filename: identity.canonical_filename,
        identity_authority: "WORKBOOK_HEADER",
      };

      const { error: updateError } = await supabase.schema("core")
        .from("operations_collection_artifact")
        .update({
          service_date: identity.service_date,
          original_filename: identity.canonical_filename,
          artifact_status: "READY_FOR_INGEST",
          runner_artifact_json: runnerArtifact,
          error_message: null,
          ingest_metadata_json: {
            ...(artifact.ingest_metadata_json ?? {}),
            source: "prepare_manifest_collection_artifacts",
            prepared_at: new Date().toISOString(),
            identity_authority: "WORKBOOK_HEADER",
            manifest_identity: identity,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", artifact.id);
      if (updateError) throw new Error(updateError.message);

      prepared.push({ artifact_id: artifact.id, status: "PREPARED", identity });
    } catch (identityError) {
      const message = identityError instanceof Error ? identityError.message : "Manifest Header identity could not be resolved.";
      await supabase.schema("core")
        .from("operations_collection_artifact")
        .update({
          artifact_status: "FAILED",
          error_message: message,
          ingest_metadata_json: {
            ...(artifact.ingest_metadata_json ?? {}),
            source: "prepare_manifest_collection_artifacts",
            failed_at: new Date().toISOString(),
            reason: "MANIFEST_HEADER_IDENTITY_INVALID",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", artifact.id);
      prepared.push({ artifact_id: artifact.id, status: "FAILED", error: message });
    }
  }

  return prepared;
}

async function reconcileManifestCollectionRequests(
  supabase: any,
  collectionRequestId: string | null
) {
  let requestQuery = supabase
    .from("operations_collection_artifact_v")
    .select("collection_request_id, created_at")
    .eq("request_status", "ARTIFACTS_READY")
    .order("created_at", { ascending: true })
    .limit(50);

  if (collectionRequestId) {
    requestQuery = requestQuery.eq(
      "collection_request_id",
      collectionRequestId
    );
  }

  const { data: requests, error: requestError } = await requestQuery;

  if (requestError) {
    throw new Error(requestError.message);
  }

  const uniqueRequestIds = Array.from(
    new Set((requests ?? []).map((row: any) => row.collection_request_id).filter(Boolean))
  );

  const reconciled = [];

  for (const requestId of uniqueRequestIds) {
    const { data: artifacts, error: artifactError } = await supabase
      .from("operations_collection_artifact_v")
      .select("artifact_status, report_batch_id, normalized_filename, ingest_metadata_json")
      .eq("collection_request_id", requestId)
      .eq("artifact_kind", "REPORT_FILE");

    if (artifactError) {
      throw new Error(artifactError.message);
    }

    const rows = artifacts ?? [];

    if (rows.length === 0) {
      await supabase.rpc("update_operations_collection_request_status", {
        p_request_id: requestId,
        p_request_status: "FAILED",
        p_error_message: "No report artifacts were registered for this collection request.",
        p_automation_run_id: null,
        p_report_batch_ids: null,
      });

      reconciled.push({ request_id: requestId, status: "FAILED", reason: "NO_ARTIFACTS" });
      continue;
    }

    const readyOrIngesting = rows.some((row: any) =>
      ["READY_FOR_INGEST", "INGESTING", "ARTIFACTS_READY"].includes(row.artifact_status)
    );

    if (readyOrIngesting) continue;

    const ingested = rows.filter((row: any) => row.artifact_status === "INGESTED");
    const promoted = rows.filter(
      (row: any) =>
        row.artifact_status === "IGNORED" &&
        row.ingest_metadata_json?.source === "promote_operations_collection_manifest_artifacts"
    );
    const failed = rows.filter((row: any) => row.artifact_status === "FAILED");

    if (ingested.length === 0 && promoted.length === 0 && failed.length > 0) {
      await supabase.rpc("update_operations_collection_request_status", {
        p_request_id: requestId,
        p_request_status: "FAILED",
        p_error_message: "All report artifacts failed processing.",
        p_automation_run_id: null,
        p_report_batch_ids: null,
      });

      reconciled.push({ request_id: requestId, status: "FAILED", reason: "ALL_ARTIFACTS_FAILED" });
      continue;
    }

    await supabase.rpc("update_operations_collection_request_status", {
      p_request_id: requestId,
      p_request_status: "COMPLETE",
      p_error_message: failed.length > 0 ? "One or more artifacts failed processing." : null,
      p_automation_run_id: null,
      p_report_batch_ids: ingested.map((row: any) => row.report_batch_id).filter(Boolean),
    });

    reconciled.push({
      request_id: requestId,
      status: "COMPLETE",
      reason:
        promoted.length > 0
          ? failed.length > 0
            ? "PARTIAL_MANIFEST_PROMOTION_SUCCESS"
            : "ALL_MANIFEST_ARTIFACTS_PROMOTED"
          : failed.length > 0
            ? "PARTIAL_ARTIFACT_SUCCESS"
            : "ALL_ARTIFACTS_INGESTED",
      promoted_count: promoted.length,
      ingested_count: ingested.length,
      failed_count: failed.length,
    });
  }

  return reconciled;
}

async function handleManifestArtifactProcess(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const runnerAuthorized = isRunnerAuthorized(req);
    if (!runnerAuthorized && !isCronAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const body =
      req.method === "POST"
        ? await req.json().catch(() => ({}))
        : {};
    const collectionRequestId =
      typeof body?.request_id === "string" ? body.request_id : null;
    if (runnerAuthorized && !collectionRequestId) {
      return NextResponse.json(
        { ok: false, error: "Runner request_id is required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServiceRoleClient();
    const prepared = await prepareManifestCollectionArtifacts(
      supabase,
      parseLimit(req) * 5,
      collectionRequestId
    );
    const { data: promoted, error: promoteError } = await supabase.rpc(
      "promote_operations_collection_manifest_artifacts",
      {
        p_collection_request_id: collectionRequestId,
        p_limit: parseLimit(req),
      }
    );

    if (promoteError) {
      throw new Error(promoteError.message);
    }

    const processed = await processCapturedManifestArtifacts({
      supabase,
      limit: parseLimit(req),
      collectionRequestId,
    });
    const reconciled = await reconcileManifestCollectionRequests(
      supabase,
      collectionRequestId
    );

    return NextResponse.json({
      ok: true,
      prepared_count: prepared.length,
      prepared,
      promoted,
      processed_count: processed.length,
      processed,
      reconciled_count: reconciled.length,
      reconciled,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Manifest artifact processor failed.",
        elapsed_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleManifestArtifactProcess(req);
}

export async function POST(req: NextRequest) {
  return handleManifestArtifactProcess(req);
}
