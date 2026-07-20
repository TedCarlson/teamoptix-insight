import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCompanyBySlug } from "@/features/automation/server/automation.repository";
import { ingestArtifactWorkbook } from "@/features/operations/reports/automation/ingestArtifactWorkbook";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

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


async function refreshRequestStatus(params: { supabase: any; requestId: string }) {
  const { supabase, requestId } = params;

  const { data: artifacts, error: artifactError } = await supabase
    .from("operations_collection_artifact_v")
    .select("artifact_status,report_batch_id,request_type,report_family_key,service_date,ingest_metadata_json")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE");

  if (artifactError) throw new Error(artifactError.message);
  const rows = artifacts ?? [];
  if (rows.some((row: any) => ["READY_FOR_INGEST", "INGESTING", "ARTIFACTS_READY"].includes(row.artifact_status))) return;

  const isPreviousDayClose = rows.some((row: any) => row.request_type === "PREVIOUS_DAY_CLOSE");
  const validClose = rows.length > 0 && rows.every((row: any) => {
    const ingest = row?.ingest_metadata_json?.ingest;
    return row.artifact_status === "INGESTED" &&
      row.report_family_key === "DSW" &&
      Boolean(ingest?.service_date) &&
      ingest?.snapshot_kind === "FINAL" &&
      Boolean(ingest?.batch_id);
  });

  if (isPreviousDayClose && !validClose) {
    await supabase.rpc("update_operations_collection_request_status", {
      p_request_id: requestId,
      p_request_status: "FAILED",
      p_error_message: "Previous-day close failed: ingested DSW A1 dates must cover the ticket range and produce FINAL report batches.",
      p_automation_run_id: null,
      p_report_batch_ids: null,
    });
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

async function handleArtifactIngest(req: NextRequest, context: RouteContext) {
  const startedAt = Date.now();

  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyBySlug(supabase, slug);
    if (!resolved.company) {
      return NextResponse.json({ ok: false, error: resolved.error ?? "Company not found." }, { status: 404 });
    }

    const { data: artifacts, error: artifactError } = await supabase
      .from("operations_collection_artifact_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .eq("artifact_kind", "REPORT_FILE")
      .eq("artifact_status", "READY_FOR_INGEST")
      .not("normalized_filename", "in", '("Delivery Manifest.xlsx","Pickup Manifest.xlsx","Combined Manifest.xlsx")')
      .order("created_at", { ascending: true })
      .limit(5);

    if (artifactError) throw new Error(artifactError.message);

    const processed = [];

    for (const artifact of artifacts ?? []) {
      const artifactKey = String(artifact.runner_artifact_json?.artifact_key ?? "").toUpperCase();
      if (artifactKey === "FCC_SERVICE_AREA_SUMMARY" || artifactKey === "SERVICE_AREA_SUMMARY") {
        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "IGNORED",
          metadata: {
            source: "artifact_ingest",
            phase: "IGNORED",
            ignored_at: new Date().toISOString(),
            reason: "Service Area Summary is not a governed Insight artifact. Runner collection is limited to FCC Work Area Summary.",
          },
        });
        await refreshRequestStatus({ supabase, requestId: artifact.collection_request_id });
        processed.push({
          artifact_id: artifact.id,
          collection_request_id: artifact.collection_request_id,
          status: "IGNORED",
          reason: "UNSUPPORTED_SERVICE_AREA_SUMMARY",
        });
        continue;
      }

      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "INGESTING",
        metadata: { source: "artifact_ingest", started_at: new Date().toISOString() },
      });

      try {
        const ingest = await ingestArtifactWorkbook({
          supabase,
          slug,
          artifact,
          uploadedByAuthUserId: null,
          uploadedByProfileId: null,
        });

        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "INGESTED",
          metadata: { source: "artifact_ingest", completed_at: new Date().toISOString(), ingest },
          reportBatchId: ingest.batch_id ?? null,
        });

        await refreshRequestStatus({ supabase, requestId: artifact.collection_request_id });

        processed.push({
          artifact_id: artifact.id,
          collection_request_id: artifact.collection_request_id,
          report_family_key: artifact.report_family_key,
          batch_id: ingest.batch_id ?? null,
          inserted_row_count: ingest.inserted_row_count ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Artifact ingest failed.";

        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "FAILED",
          metadata: { source: "artifact_ingest", failed_at: new Date().toISOString() },
          errorMessage: message,
        });

        await supabase.rpc("update_operations_collection_request_status", {
          p_request_id: artifact.collection_request_id,
          p_request_status: "FAILED",
          p_error_message: message,
          p_automation_run_id: null,
          p_report_batch_ids: null,
        });

      }
    }

    return NextResponse.json({
      ok: true,
      processed_count: processed.length,
      processed,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Artifact ingest failed." },
      { status: 500 }
    );
  }
}


export async function GET(req: NextRequest, context: RouteContext) {
  return handleArtifactIngest(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handleArtifactIngest(req, context);
}
