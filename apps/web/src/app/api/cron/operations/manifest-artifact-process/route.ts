import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processCapturedManifestArtifacts } from "@/features/operations/manifests/manifest.processor";
import { backfillManifestCollectionPaceMetadata } from "@/features/operations/manifests/manifestCollectionBackfill";
import { manifestIdentityFromBuffer } from "@/features/operations/manifests/manifest.identity";
import {
  isManifestCollectionArtifact,
  manifestPreparationPayload,
} from "@/features/operations/reports/automation/collectionArtifactAuthority";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ingestRouteGpxArtifact,
  isRouteGpxCollectionArtifact,
  resolveRouteGpxManifestReadiness,
} from "@/features/operations/manifests/routeGpx";

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
    .order("created_at", { ascending: true })
    .limit(250);

  if (collectionRequestId) {
    artifactQuery = artifactQuery.eq(
      "collection_request_id",
      collectionRequestId
    );
  }

  const { data: artifacts, error } = await artifactQuery;

  if (error) throw new Error(error.message);

  const prepared = [];
  for (const artifact of (artifacts ?? [])
    .filter(isManifestCollectionArtifact)
    .slice(0, Math.max(1, Math.min(limit, 250)))) {
    const failedByPromotion = artifact.artifact_status === "FAILED" &&
      artifact.ingest_metadata_json?.source === "promote_operations_collection_manifest_artifacts";
    if (artifact.artifact_status === "FAILED" && !failedByPromotion) continue;

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(artifact.storage_bucket)
        .download(artifact.storage_path);
      if (downloadError || !blob) throw new Error(downloadError?.message ?? "Manifest artifact was not readable.");

      const identity = manifestIdentityFromBuffer(Buffer.from(await blob.arrayBuffer()));
      const preparation = manifestPreparationPayload({
        artifact,
        identity,
        preparedAt: new Date().toISOString(),
      });
      const { error: updateError } = await supabase.rpc(
        "prepare_operations_collection_manifest_artifact",
        {
          p_artifact_id: artifact.id,
          p_service_date: preparation.serviceDate,
          p_original_filename: preparation.originalFilename,
          p_normalized_filename: preparation.normalizedFilename,
          p_runner_artifact_json: preparation.runnerArtifact,
          p_ingest_metadata_json: preparation.ingestMetadata,
        }
      );
      if (updateError) throw new Error(updateError.message);

      prepared.push({ artifact_id: artifact.id, status: "PREPARED", identity });
    } catch (identityError) {
      const message = identityError instanceof Error ? identityError.message : "Manifest Header identity could not be resolved.";
      const { error: failureUpdateError } = await supabase.rpc(
        "update_operations_collection_artifact_status",
        {
          p_artifact_id: artifact.id,
          p_artifact_status: "FAILED",
          p_ingest_metadata_json: {
            ...(artifact.ingest_metadata_json ?? {}),
            source: "prepare_manifest_collection_artifacts",
            failed_at: new Date().toISOString(),
            reason: "MANIFEST_HEADER_IDENTITY_INVALID",
          },
          p_report_batch_id: null,
          p_error_message: message,
        }
      );
      if (failureUpdateError) throw new Error(failureUpdateError.message);
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

async function processRouteGpxCollectionArtifacts(
  supabase: any,
  limit: number,
  collectionRequestId: string | null
) {
  let query = supabase
    .from("operations_collection_artifact_v")
    .select("*")
    .eq("artifact_kind", "REPORT_FILE")
    .in("artifact_status", ["READY_FOR_INGEST", "FAILED"])
    .order("created_at", { ascending: true })
    .limit(250);
  if (collectionRequestId) {
    query = query.eq("collection_request_id", collectionRequestId);
  }
  const { data: artifacts, error } = await query;
  if (error) throw new Error(error.message);

  const processed = [];
  for (const artifact of (artifacts ?? [])
    .filter((artifact: any) =>
      isRouteGpxCollectionArtifact(artifact) &&
      (
        artifact.artifact_status === "READY_FOR_INGEST" ||
        (
          artifact.artifact_status === "FAILED" &&
          artifact.ingest_metadata_json?.source ===
            "runner_v2_direct_ingestion"
        )
      )
    )
    .slice(0, Math.max(1, Math.min(limit, 250)))) {
    try {
      const readiness = await resolveRouteGpxManifestReadiness({
        supabase,
        artifact,
      });
      if (readiness.status === "PENDING") {
        processed.push({
          artifact_id: artifact.id,
          status: "WAITING_FOR_MANIFEST",
        });
        continue;
      }
      if (readiness.status === "INVALID") {
        throw new Error(
          "Route GPX requires a workbook-verified sibling manifest for the same route and service date."
        );
      }
      const { error: startError } = await supabase.rpc(
        "update_operations_collection_artifact_status",
        {
          p_artifact_id: artifact.id,
          p_artifact_status: "INGESTING",
          p_ingest_metadata_json: {
            ...(artifact.ingest_metadata_json ?? {}),
            source: "route_gpx_parser",
            phase: "INGESTING",
            started_at: new Date().toISOString(),
          },
          p_report_batch_id: null,
          p_error_message: null,
        }
      );
      if (startError) throw new Error(startError.message);

      const result = await ingestRouteGpxArtifact({
        supabase,
        artifact,
        verifiedManifest: readiness.manifest,
      });
      const { error: completeError } = await supabase.rpc(
        "update_operations_collection_artifact_status",
        {
          p_artifact_id: artifact.id,
          p_artifact_status: "INGESTED",
          p_ingest_metadata_json: {
            ...(artifact.ingest_metadata_json ?? {}),
            source: "route_gpx_parser",
            phase: "INGESTED",
            completed_at: new Date().toISOString(),
            result,
          },
          p_report_batch_id: null,
          p_error_message: null,
        }
      );
      if (completeError) throw new Error(completeError.message);
      processed.push({ artifact_id: artifact.id, status: "INGESTED", ...result });
    } catch (gpxError) {
      const message =
        gpxError instanceof Error ? gpxError.message : "Route GPX processing failed.";
      const { error: failureError } = await supabase.rpc(
        "update_operations_collection_artifact_status",
        {
          p_artifact_id: artifact.id,
          p_artifact_status: "FAILED",
          p_ingest_metadata_json: {
            ...(artifact.ingest_metadata_json ?? {}),
            source: "route_gpx_parser",
            phase: "FAILED",
            failed_at: new Date().toISOString(),
          },
          p_report_batch_id: null,
          p_error_message: message,
        }
      );
      if (failureError) throw new Error(failureError.message);
      processed.push({ artifact_id: artifact.id, status: "FAILED", error: message });
    }
  }
  return processed;
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

    const batchLimit = collectionRequestId ? 250 : parseLimit(req);
    const supabase = createSupabaseServiceRoleClient();
    const prepared = await prepareManifestCollectionArtifacts(
      supabase,
      batchLimit,
      collectionRequestId
    );
    const { data: promoted, error: promoteError } = await supabase.rpc(
      "promote_operations_collection_manifest_artifacts",
      {
        p_collection_request_id: collectionRequestId,
        p_limit: batchLimit,
      }
    );

    if (promoteError) {
      throw new Error(promoteError.message);
    }

    const processed = await processCapturedManifestArtifacts({
      supabase,
      limit: batchLimit,
      collectionRequestId,
    });
    const routeGpx = await processRouteGpxCollectionArtifacts(
      supabase,
      batchLimit,
      collectionRequestId
    );
    const reconciled = await reconcileManifestCollectionRequests(
      supabase,
      collectionRequestId
    );
    const sourceRetentionAudit = collectionRequestId
      ? null
      : await supabase.rpc(
          "audit_operations_direct_ingestion_source_retention",
          { p_limit: 500 }
        );
    if (sourceRetentionAudit?.error) {
      throw new Error(sourceRetentionAudit.error.message);
    }
    const paceBackfill = collectionRequestId
      ? []
      : await backfillManifestCollectionPaceMetadata({
          supabase,
          limit: batchLimit,
        });

    return NextResponse.json({
      ok: true,
      prepared_count: prepared.length,
      prepared,
      promoted,
      processed_count: processed.length,
      processed,
      route_gpx_count: routeGpx.length,
      route_gpx: routeGpx,
      reconciled_count: reconciled.length,
      reconciled,
      source_retention_audit: sourceRetentionAudit?.data ?? null,
      pace_backfill_count: paceBackfill.filter(
        (row) => row.status === "BACKFILLED"
      ).length,
      pace_backfill: paceBackfill,
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
