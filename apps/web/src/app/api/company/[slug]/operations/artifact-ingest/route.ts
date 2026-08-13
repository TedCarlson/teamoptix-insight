import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveAutomationAccess,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { ingestArtifactWorkbook } from "@/features/operations/reports/automation/ingestArtifactWorkbook";
import { isManifestCollectionArtifact } from "@/features/operations/reports/automation/collectionArtifactAuthority";

export const runtime = "nodejs";

const DECOMMISSIONED_FCC_ARTIFACT_KEYS = new Set([
  "FCC_SERVICE_AREA_SUMMARY",
  "SERVICE_AREA_SUMMARY",
]);

type RouteContext = { params: Promise<{ slug: string }> };

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
    .select("artifact_status,report_batch_id,request_type,report_family_key,service_date,ingest_metadata_json,runner_artifact_json")
    .eq("collection_request_id", requestId)
    .eq("artifact_kind", "REPORT_FILE");

  if (artifactError) throw new Error(artifactError.message);
  const rows = artifacts ?? [];
  if (rows.some((row: any) => ["READY_FOR_INGEST", "INGESTING", "ARTIFACTS_READY"].includes(row.artifact_status))) return;

  const isPreviousDayClose = rows.some((row: any) => row.request_type === "PREVIOUS_DAY_CLOSE");
  const requiredCloseRows = rows.filter(
    (row: any) =>
      String(row?.runner_artifact_json?.artifact_key ?? "").toUpperCase() !==
      "DSW_ALL_STATUS_CODE_PACKAGES"
  );
  const validClose = requiredCloseRows.length > 0 && requiredCloseRows.every((row: any) => {
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
    const runnerAuthorized = isRunnerAuthorized(req);
    const session = await getSupabaseServerClient();

    if (!runnerAuthorized) {
      const access = await resolveAutomationAccess(session, slug);
      if (!access.canAdmin) {
        return NextResponse.json(
          { error: access.error ?? "Forbidden." },
          { status: access.allowed ? 403 : access.status }
        );
      }
    }

    const supabase = createSupabaseServiceRoleClient();
    const resolved = await resolveCompanyBySlug(
      runnerAuthorized ? (supabase as any) : session,
      slug
    );
    if (!resolved.company) {
      return NextResponse.json({ ok: false, error: resolved.error ?? "Company not found." }, { status: 404 });
    }

    const body =
      req.method === "POST"
        ? await req.json().catch(() => ({}))
        : {};
    const requestId =
      typeof body?.request_id === "string" ? body.request_id : null;

    let artifactQuery = supabase
      .from("operations_collection_artifact_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .eq("artifact_kind", "REPORT_FILE")
      .eq("artifact_status", "READY_FOR_INGEST")
      .order("created_at", { ascending: true });

    if (runnerAuthorized && !requestId) {
      return NextResponse.json(
        { ok: false, error: "Runner request_id is required." },
        { status: 400 }
      );
    }
    if (requestId) {
      artifactQuery = artifactQuery
        .eq("collection_request_id", requestId)
        .limit(100);
    } else {
      artifactQuery = artifactQuery.limit(5);
    }

    const { data: artifacts, error: artifactError } = await artifactQuery;

    if (artifactError) throw new Error(artifactError.message);

    const processed = [];

    for (const artifact of (artifacts ?? []).filter(
      (row: any) => !isManifestCollectionArtifact(row)
    )) {
      const artifactKey = String(artifact.runner_artifact_json?.artifact_key ?? "").toUpperCase();
      if (DECOMMISSIONED_FCC_ARTIFACT_KEYS.has(artifactKey)) {
        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "IGNORED",
          metadata: {
            source: "artifact_ingest",
            phase: "VERIFIED_IGNORED",
            verified_at: new Date().toISOString(),
            ignored_at: new Date().toISOString(),
            reason: "Decommissioned FCC service-area artifact was verified and ignored.",
          },
        });
        await refreshRequestStatus({ supabase, requestId: artifact.collection_request_id });
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
        const optionalPackageStatus =
          artifactKey === "DSW_ALL_STATUS_CODE_PACKAGES";

        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "FAILED",
          metadata: { source: "artifact_ingest", failed_at: new Date().toISOString() },
          errorMessage: message,
        });

        if (optionalPackageStatus) {
          await refreshRequestStatus({
            supabase,
            requestId: artifact.collection_request_id,
          });
          processed.push({
            artifact_id: artifact.id,
            collection_request_id: artifact.collection_request_id,
            status: "FAILED_OPTIONAL",
            warning: message,
          });
        } else {
          await supabase.rpc("update_operations_collection_request_status", {
            p_request_id: artifact.collection_request_id,
            p_request_status: "FAILED",
            p_error_message: message,
            p_automation_run_id: null,
            p_report_batch_ids: null,
          });
        }

      }
    }

    let manifestProcessing: Record<string, unknown> | null = null;
    if (runnerAuthorized && requestId) {
      const manifestResponse = await fetch(
        new URL(
          "/api/cron/operations/manifest-artifact-process",
          req.nextUrl.origin
        ),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.INSIGHT_ARTIFACT_INGEST_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ request_id: requestId }),
          cache: "no-store",
        }
      );
      manifestProcessing = await manifestResponse.json().catch(() => ({
        ok: false,
        error: "Manifest processor returned an unreadable response.",
      }));
      if (!manifestResponse.ok) {
        throw new Error(
          typeof manifestProcessing?.error === "string"
            ? manifestProcessing.error
            : "Manifest processor failed."
        );
      }
    }

    return NextResponse.json({
      ok: true,
      processed_count: processed.length,
      processed,
      manifest_processing: manifestProcessing,
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
