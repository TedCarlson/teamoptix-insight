import { readFile, stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  resolveAutomationAccess,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";

export const runtime = "nodejs";


async function resolveWorkerWorkbook(params: {
  supabase: any;
  excelDownload: any;
}) {
  const { supabase, excelDownload } = params;

  if (excelDownload?.artifact?.artifactBucket &&
      excelDownload?.artifact?.artifactPath) {

    const { data, error } = await supabase.storage
      .from(excelDownload.artifact.artifactBucket)
      .download(excelDownload.artifact.artifactPath);

    if (error || !data) {
      throw new Error(error?.message ?? "Artifact download failed.");
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return {
      buffer,
      size: excelDownload.artifact.artifactSize ?? buffer.length,
    };
  }

  if (excelDownload?.fileBase64) {
    const buffer = Buffer.from(
      excelDownload.fileBase64,
      "base64"
    );

    return {
      buffer,
      size: excelDownload.fileSize ?? buffer.length,
    };
  }

  const buffer = await readFile(excelDownload.savedPath);
  const fileStat = await stat(excelDownload.savedPath);

  return {
    buffer,
    size: fileStat.size,
  };
}


export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const supabase = await getSupabaseServerClient();
  const admin = createSupabaseServiceRoleClient();
  let runId: string | null = null;

  try {
    const { slug } = await context.params;
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.canAdmin) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.allowed ? 403 : access.status }
      );
    }

    const resolved = await resolveCompanyBySlug(supabase, slug);

    if (!resolved.company) {
      return NextResponse.json({ error: resolved.error ?? "Company not found." }, { status: 404 });
    }

    const startRun = await admin.rpc("start_operations_automation_run", {
      p_company_id: resolved.company.id,
      p_automation_type: "DSW",
    });

    runId = typeof startRun.data === "string" ? startRun.data : null;

    const profileResult = await getOrCreateFedExAutomationProfile(admin, resolved.company.id);

    if (!profileResult.profile) {
      throw new Error(profileResult.error ?? "Profile not found.");
    }

    const credentialResult = await getAutomationCredentialForVerify(admin, profileResult.profile.id);

    if (!credentialResult.row) {
      throw new Error(credentialResult.error ?? "No credential saved.");
    }

    const downloadStartedAt = Date.now();

    const workerUrl = process.env.AUTOMATION_WORKER_URL;
    const workerToken = process.env.AUTOMATION_WORKER_TOKEN;

    const result = workerUrl
      ? await fetch(`${workerUrl.replace(/\/$/, "")}/run-dsw`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
          },
          body: JSON.stringify({
            username: credentialResult.row.username,
            password: credentialResult.row.encrypted_secret,
            companyId: resolved.company.id,
            runId,
          }),
          cache: "no-store",
        }).then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              ok: false,
              stage: "worker_dsw_download",
              message: body?.error ?? body?.message ?? "Worker DSW download failed.",
              workerStatus: res.status,
              workerBody: body,
            };
          }
          return body;
        })
      : await import("@/features/automation/server/automation.discovery").then(({ discoverFedExNavigation }) =>
          discoverFedExNavigation({
            username: credentialResult.row.username,
            password: credentialResult.row.encrypted_secret,
          })
        );

    const downloadMs = Date.now() - downloadStartedAt;

    if (!result.ok || !result.excelDownload?.savedPath) {
      throw new Error("DSW automation did not produce a downloadable file.");
    }

    const workbook = await resolveWorkerWorkbook({
      supabase,
      excelDownload: result.excelDownload,
    });

    const downloadedFile = workbook.buffer;

    const downloadedStat = {
      size: workbook.size,
    };

    const { data: profile } = access.userId
      ? await supabase
          .from("user_profile")
          .select("profile_id")
          .eq("auth_user_id", access.userId)
          .maybeSingle()
      : { data: null };

    const ingestStartedAt = Date.now();

    const ingest = await ingestDswWorkbook({
      supabase: admin,
      slug,
      buffer: downloadedFile,
      filename: result.excelDownload.suggestedFilename,
      fileSize: downloadedStat.size,
      uploadedByAuthUserId: access.userId,
      uploadedByProfileId: profile?.profile_id ?? null,
    });

    const ingestMs = Date.now() - ingestStartedAt;

    if (runId) {
      await admin.rpc("finish_operations_automation_run", {
        p_run_id: runId,
        p_status: "SUCCESS",
        p_source_filename: result.excelDownload.suggestedFilename,
        p_batch_id: ingest.batch_id,
        p_inserted_rows: ingest.inserted_row_count,
        p_matched_rows: ingest.matched_route_count,
        p_unmatched_rows: ingest.unmatched_route_count,
        p_route_count: ingest.row_classification?.route_count ?? ingest.inserted_row_count,
        p_summary_rows: ingest.inserted_summary_row_count,
        p_download_ms: downloadMs,
        p_ingest_ms: ingestMs,
        p_error_message: null,
      });
    }

    return NextResponse.json(
      {
        ...result,
        ingest,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation run failed.";

    if (runId) {
      await admin.rpc("finish_operations_automation_run", {
        p_run_id: runId,
        p_status: "FAILED",
        p_source_filename: null,
        p_batch_id: null,
        p_inserted_rows: null,
        p_matched_rows: null,
        p_unmatched_rows: null,
        p_route_count: null,
        p_summary_rows: null,
        p_download_ms: null,
        p_ingest_ms: null,
        p_error_message: message,
      });
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
