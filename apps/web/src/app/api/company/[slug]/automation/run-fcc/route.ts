import { readFile, stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { discoverFedExFccServiceAreaStatus } from "@/features/automation/server/automation.discovery";
import { ingestFccWorkbook } from "@/features/operations/reports/fcc/fcc.ingest";

export const runtime = "nodejs";

function todayIsoNewYork() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const supabase = await getSupabaseServerClient();
  let runId: string | null = null;

  try {
    const { slug } = await context.params;
    const serviceDate = req.nextUrl.searchParams.get("date") ?? todayIsoNewYork();

    const resolved = await resolveCompanyBySlug(supabase, slug);

    if (!resolved.company) {
      return NextResponse.json({ error: resolved.error ?? "Company not found." }, { status: 404 });
    }

    const startRun = await supabase.rpc("start_operations_automation_run", {
      p_company_id: resolved.company.id,
      p_automation_type: "FCC",
    });

    runId = typeof startRun.data === "string" ? startRun.data : null;

    const profileResult = await getOrCreateFedExAutomationProfile(supabase, resolved.company.id);
    if (!profileResult.profile) throw new Error(profileResult.error ?? "Profile not found.");

    const credentialResult = await getAutomationCredentialForVerify(supabase, profileResult.profile.id);
    if (!credentialResult.row) throw new Error(credentialResult.error ?? "No credential saved.");

    const downloadStartedAt = Date.now();

    const result = await discoverFedExFccServiceAreaStatus({
      username: credentialResult.row.username,
      password: credentialResult.row.encrypted_secret,
      serviceDate,
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
          p_error_message: result.message ?? "FCC automation did not produce a downloadable file.",
        });
      }

      return NextResponse.json(result, { status: 409 });
    }

    const fileBuffer = await readFile(result.excelDownload.savedPath);
    const fileStat = await stat(result.excelDownload.savedPath);

    const ingestStartedAt = Date.now();

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth?.user?.id
      ? await supabase
          .from("user_profile")
          .select("profile_id")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle()
      : { data: null };

    const ingest = await ingestFccWorkbook({
      supabase,
      slug,
      buffer: fileBuffer,
      filename: result.excelDownload.suggestedFilename,
      fileSize: fileStat.size,
      serviceDate,
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
        p_route_count: ingest.inserted_row_count,
        p_summary_rows: null,
        p_download_ms: downloadMs,
        p_ingest_ms: ingestMs,
        p_error_message: null,
      });
    }

    return NextResponse.json({
      ...result,
      file_size: fileStat.size,
      service_date: serviceDate,
      ingest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FCC automation run failed.";

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
