import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { ingestArtifactWorkbook } from "@/features/operations/reports/automation/ingestArtifactWorkbook";

export const runtime = "nodejs";

const DECOMMISSIONED_FCC_ARTIFACT_KEYS = new Set([
  "FCC_SERVICE_AREA_SUMMARY",
  "SERVICE_AREA_SUMMARY",
]);

function artifactAuditContext(artifact: any) {
  return {
    artifact_id: artifact.id,
    collection_request_id: artifact.collection_request_id,
    request_type: artifact.request_type,
    report_family_key: artifact.report_family_key,
    report_shape_key: artifact.report_shape_key,
    original_filename: artifact.original_filename,
    normalized_filename: artifact.normalized_filename,
    source_hash: artifact.source_hash,
    storage_bucket: artifact.storage_bucket,
    storage_path: artifact.storage_path,
  };
}

async function markArtifact(params: {
  supabase: any;
  artifactId: string;
  status: "INGESTING" | "INGESTED" | "FAILED" | "IGNORED";
  metadata?: Record<string, unknown>;
  reportBatchId?: string | null;
  errorMessage?: string | null;
}) {
  const { supabase, artifactId, status, metadata = {}, reportBatchId = null, errorMessage = null } = params;

  const { error } = await supabase.rpc("update_operations_collection_artifact_status", {
    p_artifact_id: artifactId,
    p_artifact_status: status,
    p_ingest_metadata_json: metadata,
    p_report_batch_id: reportBatchId,
    p_error_message: errorMessage,
  });

  if (error) throw new Error(error.message);
}

function isValidPreviousDayCloseArtifact(row: any) {
  const ingest = row?.ingest_metadata_json?.ingest;
  return (
    row?.artifact_status === "INGESTED" &&
    row?.report_family_key === "DSW" &&
    Boolean(ingest?.service_date) &&
    ingest?.snapshot_kind === "FINAL" &&
    Boolean(ingest?.batch_id)
  );
}

async function failRequest(supabase: any, requestId: string, message: string) {
  await supabase.rpc("update_operations_collection_request_status", {
    p_request_id: requestId,
    p_request_status: "FAILED",
    p_error_message: message,
    p_automation_run_id: null,
    p_report_batch_ids: null,
  });
}

async function completeRequest(supabase: any, requestId: string) {
  const { data: artifacts } = await supabase
    .from("operations_collection_artifact_v")
    .select("artifact_status,report_batch_id,request_type,request_status,report_family_key,service_date,ingest_metadata_json")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE");

  const rows = artifacts ?? [];
  if (rows.some((row: any) => ["READY_FOR_INGEST", "INGESTING", "ARTIFACTS_READY"].includes(row.artifact_status))) return;
  if (rows.some((row: any) => row.request_status !== "ARTIFACTS_READY")) return;

  const isPreviousDayClose = rows.some((row: any) => row.request_type === "PREVIOUS_DAY_CLOSE");
  if (isPreviousDayClose && (rows.length === 0 || !rows.every(isValidPreviousDayCloseArtifact))) {
    await failRequest(
      supabase,
      requestId,
      "Previous-day close failed: ingested DSW A1 dates must cover the ticket range and produce FINAL report batches."
    );
    return;
  }

  const ingested = rows.filter((row: any) => row.artifact_status === "INGESTED");

  await supabase.rpc("update_operations_collection_request_status", {
    p_request_id: requestId,
    p_request_status: "COMPLETE",
    p_error_message: null,
    p_automation_run_id: null,
    p_report_batch_ids: ingested.map((row: any) => row.report_batch_id).filter(Boolean),
  });
}

async function reconcileArtifactReadyRequests(supabase: any) {
  const { data: requests } = await supabase
    .from("operations_collection_artifact_v")
    .select("collection_request_id, created_at")
    .eq("request_status", "ARTIFACTS_READY")
    .order("created_at", { ascending: true })
    .limit(25);

  const reconciled = [];

  for (const request of requests ?? []) {
    const { data: artifacts } = await supabase
      .from("operations_collection_artifact_v")
      .select("artifact_status,report_batch_id,request_type,report_family_key,service_date,ingest_metadata_json")
      .eq("collection_request_id", request.collection_request_id)
      .eq("artifact_kind", "REPORT_FILE");

    const rows = artifacts ?? [];
    const readyOrIngesting = rows.some((row: any) =>
      ["READY_FOR_INGEST", "INGESTING"].includes(row.artifact_status)
    );
    const failed = rows.some((row: any) => row.artifact_status === "FAILED");
    const ingested = rows.filter((row: any) => row.artifact_status === "INGESTED");
    const isPreviousDayClose = rows.some((row: any) => row.request_type === "PREVIOUS_DAY_CLOSE");

    if (readyOrIngesting) continue;

    if (isPreviousDayClose && !rows.every(isValidPreviousDayCloseArtifact)) {
      await failRequest(
        supabase,
        request.collection_request_id,
        "Previous-day close failed: ingested DSW A1 dates must cover the ticket range and produce FINAL report batches."
      );
      reconciled.push({ request_id: request.collection_request_id, status: "FAILED", reason: "INVALID_DSW_CLOSE_CONTRACT" });
      continue;
    }

    if (rows.length === 0) {
      await supabase.rpc("update_operations_collection_request_status", {
        p_request_id: request.collection_request_id,
        p_request_status: "FAILED",
        p_error_message: "No report artifacts were registered for this collection request.",
        p_automation_run_id: null,
        p_report_batch_ids: null,
      });

      reconciled.push({ request_id: request.collection_request_id, status: "FAILED", reason: "NO_ARTIFACTS" });
      continue;
    }

    if (failed && ingested.length === 0) {
      await supabase.rpc("update_operations_collection_request_status", {
        p_request_id: request.collection_request_id,
        p_request_status: "FAILED",
        p_error_message: "All report artifacts failed ingestion.",
        p_automation_run_id: null,
        p_report_batch_ids: null,
      });

      reconciled.push({ request_id: request.collection_request_id, status: "FAILED", reason: "ALL_ARTIFACTS_FAILED" });
      continue;
    }

    await supabase.rpc("update_operations_collection_request_status", {
      p_request_id: request.collection_request_id,
      p_request_status: "COMPLETE",
      p_error_message: failed ? "One or more artifacts failed ingestion." : null,
      p_automation_run_id: null,
      p_report_batch_ids: ingested.map((row: any) => row.report_batch_id).filter(Boolean),
    });

    reconciled.push({
      request_id: request.collection_request_id,
      status: "COMPLETE",
      reason: failed ? "PARTIAL_ARTIFACT_SUCCESS" : "ALL_ARTIFACTS_INGESTED",
    });
  }

  return reconciled;
}

export async function GET() {
  const startedAt = Date.now();
  const supabase = createSupabaseServiceRoleClient();

  const { data: artifacts, error } = await supabase
    .from("operations_collection_artifact_v")
    .select("*")
    .eq("artifact_kind", "REPORT_FILE")
    .in("request_status", ["RUNNING", "ARTIFACTS_READY", "INGESTING"])
    .in("artifact_status", ["READY_FOR_INGEST", "ARTIFACTS_READY"])
    .not("normalized_filename", "in", '("Delivery Manifest.xlsx","Pickup Manifest.xlsx","Combined Manifest.xlsx")')
    .order("ingest_priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const processed = [];

  for (const artifact of artifacts ?? []) {
    try {
      const artifactKey = String(artifact.runner_artifact_json?.artifact_key ?? "").toUpperCase();
      if (DECOMMISSIONED_FCC_ARTIFACT_KEYS.has(artifactKey)) {
        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "IGNORED",
          metadata: {
            source: "cron_artifact_ingest",
            phase: "VERIFIED_IGNORED",
            verified_at: new Date().toISOString(),
            ignored_at: new Date().toISOString(),
            reason: "Decommissioned FCC service-area artifact was verified and ignored.",
            artifact: artifactAuditContext(artifact),
          },
        });
        await completeRequest(supabase, artifact.collection_request_id);
        processed.push({
          artifact_id: artifact.id,
          collection_request_id: artifact.collection_request_id,
          status: "IGNORED",
          reason: "DECOMMISSIONED_FCC_ARTIFACT_VERIFIED_IGNORED",
        });
        continue;
      }

      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "INGESTING",
        metadata: {
          source: "cron_artifact_ingest",
          phase: "INGESTING",
          started_at: new Date().toISOString(),
          artifact: artifactAuditContext(artifact),
        },
      });

      const ingest = await ingestArtifactWorkbook({
        supabase,
        slug: artifact.company_slug,
        artifact,
      });

      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "INGESTED",
        metadata: {
          source: "cron_artifact_ingest",
          phase: "INGESTED",
          completed_at: new Date().toISOString(),
          artifact: artifactAuditContext(artifact),
          ingest,
        },
        reportBatchId: ingest.batch_id ?? null,
      });

      await completeRequest(supabase, artifact.collection_request_id);

      processed.push({
        artifact_id: artifact.id,
        collection_request_id: artifact.collection_request_id,
        batch_id: ingest.batch_id ?? null,
        inserted_row_count: ingest.inserted_row_count ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Artifact ingest failed.";

      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "FAILED",
        metadata: {
          source: "cron_artifact_ingest",
          phase: "FAILED",
          failed_at: new Date().toISOString(),
          artifact: artifactAuditContext(artifact),
          error: message,
        },
        errorMessage: message,
      }).catch(() => null);

    }
  }

  const reconciled = await reconcileArtifactReadyRequests(supabase);

  return NextResponse.json({
    ok: true,
    processed_count: processed.length,
    processed,
    reconciled_count: reconciled.length,
    reconciled,
    elapsed_ms: Date.now() - startedAt,
  });
}
