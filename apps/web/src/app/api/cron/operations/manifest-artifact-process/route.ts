import { NextRequest, NextResponse } from "next/server";
import { processCapturedManifestArtifacts } from "@/features/operations/manifests/manifest.processor";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function parseLimit(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? "10");

  if (!Number.isFinite(raw)) return 10;

  return Math.max(1, Math.min(25, Math.trunc(raw)));
}

async function reconcileManifestCollectionRequests(supabase: any) {
  const { data: requests, error: requestError } = await supabase
    .from("operations_collection_artifact_v")
    .select("collection_request_id, created_at")
    .eq("request_status", "ARTIFACTS_READY")
    .order("created_at", { ascending: true })
    .limit(50);

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

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: promoted, error: promoteError } = await supabase.rpc(
      "promote_operations_collection_manifest_artifacts",
      {
        p_collection_request_id: null,
        p_limit: parseLimit(req),
      }
    );

    if (promoteError) {
      throw new Error(promoteError.message);
    }

    const processed = await processCapturedManifestArtifacts({
      supabase,
      limit: parseLimit(req),
    });
    const reconciled = await reconcileManifestCollectionRequests(supabase);

    return NextResponse.json({
      ok: true,
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
