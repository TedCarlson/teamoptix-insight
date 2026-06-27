import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCompanyBySlug } from "@/features/automation/server/automation.repository";
import { ingestArtifactWorkbook } from "@/features/operations/reports/automation/ingestArtifactWorkbook";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

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

async function refreshRequestStatus(params: { supabase: any; requestId: string }) {
  const { supabase, requestId } = params;

  const { data: remaining, error: remainingError } = await supabase
    .from("operations_collection_artifact_v")
    .select("id")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE")
    .eq("artifact_status", "READY_FOR_INGEST")
    .limit(1);

  if (remainingError) throw new Error(remainingError.message);
  if ((remaining ?? []).length > 0) return;

  const { data: ingested, error: ingestedError } = await supabase
    .from("operations_collection_artifact_v")
    .select("report_batch_id")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE")
    .eq("artifact_status", "INGESTED");

  if (ingestedError) throw new Error(ingestedError.message);

  await supabase.rpc("update_operations_collection_request_status", {
    p_request_id: requestId,
    p_request_status: "COMPLETE",
    p_error_message: null,
    p_automation_run_id: null,
    p_report_batch_ids: (ingested ?? []).map((row: any) => row.report_batch_id).filter(Boolean),
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
      .eq("report_family_key", "DSW")
      .eq("artifact_status", "READY_FOR_INGEST")
      .order("created_at", { ascending: false })
      .limit(1);

    if (artifactError) throw new Error(artifactError.message);

    const artifact = artifacts?.[0] ?? null;
    if (!artifact) {
      return NextResponse.json({ ok: true, processed_count: 0, processed: [], elapsed_ms: Date.now() - startedAt });
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

      return NextResponse.json({
        ok: true,
        processed_count: 1,
        processed: [{
          artifact_id: artifact.id,
          collection_request_id: artifact.collection_request_id,
          batch_id: ingest.batch_id ?? null,
          inserted_row_count: ingest.inserted_row_count ?? null,
        }],
        elapsed_ms: Date.now() - startedAt,
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

      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Artifact ingest failed." },
      { status: 500 }
    );
  }
}


export async function POST(req: NextRequest, context: RouteContext) {
  return handleArtifactIngest(req, context);
}
