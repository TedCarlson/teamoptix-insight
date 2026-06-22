import { readFile, stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { discoverFedExNavigation } from "@/features/automation/server/automation.discovery";
import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyBySlug(supabase, slug);

    if (!resolved.company) {
      return NextResponse.json({ error: resolved.error ?? "Company not found." }, { status: 404 });
    }

    const profileResult = await getOrCreateFedExAutomationProfile(supabase, resolved.company.id);

    if (!profileResult.profile) {
      return NextResponse.json({ error: profileResult.error ?? "Profile not found." }, { status: 500 });
    }

    const credentialResult = await getAutomationCredentialForVerify(supabase, profileResult.profile.id);

    if (!credentialResult.row) {
      return NextResponse.json({ error: credentialResult.error ?? "No credential saved." }, { status: 400 });
    }

    const result = await discoverFedExNavigation({
      username: credentialResult.row.username,
      password: credentialResult.row.encrypted_secret,
    });

    if (!result.ok || !result.excelDownload?.savedPath) {
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
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

    const ingest = await ingestDswWorkbook({
      supabase,
      slug,
      buffer: downloadedFile,
      filename: result.excelDownload.suggestedFilename,
      fileSize: downloadedStat.size,
      uploadedByAuthUserId: auth?.user?.id ?? null,
      uploadedByProfileId: profile?.profile_id ?? null,
    });

    return NextResponse.json(
      {
        ...result,
        ingest,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Discovery failed." },
      { status: 500 }
    );
  }
}
