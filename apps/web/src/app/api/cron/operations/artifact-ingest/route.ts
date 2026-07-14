import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { ingestArtifactWorkbook } from "@/features/operations/reports/automation/ingestArtifactWorkbook";

export const runtime = "nodejs";

async function markArtifact(params: {
  supabase: any;
  artifactId: string;
  status: "INGESTING" | "INGESTED" | "FAILED";
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

async function deleteArtifactObject(artifact: any) {
  if (!artifact.storage_bucket || !artifact.storage_path) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return;

  await fetch(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(artifact.storage_bucket)}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [artifact.storage_path] }),
  }).catch(() => null);
}

async function completeRequest(supabase: any, requestId: string) {
  const { data: remaining } = await supabase
    .from("operations_collection_artifact_v")
    .select("id")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE")
    .in("artifact_status", ["READY_FOR_INGEST", "INGESTING"])
    .limit(1);

  if ((remaining ?? []).length > 0) return;

  const { data: ingested } = await supabase
    .from("operations_collection_artifact_v")
    .select("report_batch_id")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE")
    .eq("artifact_status", "INGESTED");

  await supabase.rpc("update_operations_collection_request_status", {
    p_request_id: requestId,
    p_request_status: "COMPLETE",
    p_error_message: null,
    p_automation_run_id: null,
    p_report_batch_ids: (ingested ?? []).map((row: any) => row.report_batch_id).filter(Boolean),
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
      .select("artifact_status, report_batch_id")
      .eq("collection_request_id", request.collection_request_id)
      .eq("artifact_kind", "REPORT_FILE");

    const rows = artifacts ?? [];
    const readyOrIngesting = rows.some((row: any) =>
      ["READY_FOR_INGEST", "INGESTING"].includes(row.artifact_status)
    );
    const failed = rows.some((row: any) => row.artifact_status === "FAILED");
    const ingested = rows.filter((row: any) => row.artifact_status === "INGESTED");

    if (readyOrIngesting) continue;

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
    .eq("request_status", "ARTIFACTS_READY")
    .in("artifact_status", ["READY_FOR_INGEST", "ARTIFACTS_READY"])
    .not("normalized_filename", "in", '("Delivery Manifest.xlsx","Pickup Manifest.xlsx","Combined Manifest.xlsx")')
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const processed = [];

  for (const artifact of artifacts ?? []) {
    try {
      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "INGESTING",
        metadata: { source: "cron_artifact_ingest", started_at: new Date().toISOString() },
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
        metadata: { source: "cron_artifact_ingest", completed_at: new Date().toISOString(), ingest },
        reportBatchId: ingest.batch_id ?? null,
      });

      await deleteArtifactObject(artifact);
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
        metadata: { source: "cron_artifact_ingest", failed_at: new Date().toISOString() },
        errorMessage: message,
      }).catch(() => null);

      await deleteArtifactObject(artifact);
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
