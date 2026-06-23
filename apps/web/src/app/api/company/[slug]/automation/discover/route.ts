import { readFile, stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { discoverFedExNavigationPuppeteer } from "@/features/automation/server/automation.dsw.puppeteer";
import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const supabase = await getSupabaseServerClient();
  let runId: string | null = null;

  try {
    const { slug } = await context.params;

    const resolved = await resolveCompanyBySlug(supabase, slug);

    if (!resolved.company) {
      return NextResponse.json({ error: resolved.error ?? "Company not found." }, { status: 404 });
    }

    const startRun = await supabase.rpc("start_operations_automation_run", {
      p_company_id: resolved.company.id,
      p_automation_type: "DSW",
    });

    runId = typeof startRun.data === "string" ? startRun.data : null;

    const profileResult = await getOrCreateFedExAutomationProfile(supabase, resolved.company.id);

    if (!profileResult.profile) {
      throw new Error(profileResult.error ?? "Profile not found.");
    }

    const credentialResult = await getAutomationCredentialForVerify(supabase, profileResult.profile.id);

    if (!credentialResult.row) {
      throw new Error(credentialResult.error ?? "No credential saved.");
    }

    const downloadStartedAt = Date.now();

    const result = await discoverFedExNavigationPuppeteer({
      username: credentialResult.row.username,
      password: credentialResult.row.encrypted_secret,
    });

    const downloadMs = Date.now() - downloadStartedAt;

    if (!result.ok || !result.excelDownload?.savedPath) {
      if (runId) {
        await supabase.rpc("finish_operations_automation_run", {
          p_run_id: runId,
          p_status: "FAILED",
          p_source_filename: null,
          p_batch_id: null,
          p_inserted_rows: null,
          p_matched_rows: null,
          p_unmatched_rows: null,
          p_route_count: null,
          p_summary_rows: null,
          p_download_ms: downloadMs,
          p_ingest_ms: null,
          p_error_message: result.message ?? "DSW automation did not produce a downloadable file.",
        });
      }

      return NextResponse.json(result, { status: 409 });
    }

    const downloadedFile = await readFile(result.excelDownload.savedPath);
    const downloadedStat = await stat(result.excelDownload.savedPath);

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth?.user?.id
      ? await supabase
          .from("user_profile")
          .select("profile_id")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle()
      : { data: null };

    const ingestStartedAt = Date.now();

    const ingest = await ingestDswWorkbook({
      supabase,
      slug,
      buffer: downloadedFile,
      filename: result.excelDownload.suggestedFilename,
      fileSize: downloadedStat.size,
      uploadedByAuthUserId: auth?.user?.id ?? null,
      uploadedByProfileId: profile?.profile_id ?? null,
    });

    const ingestMs = Date.now() - ingestStartedAt;

    if (runId) {
      await supabase.rpc("finish_operations_automation_run", {
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
      await supabase.rpc("finish_operations_automation_run", {
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
