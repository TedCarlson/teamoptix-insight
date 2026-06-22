import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { discoverFedExNavigation } from "@/features/automation/server/automation.discovery";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
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

    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Discovery failed." },
      { status: 500 }
    );
  }
}
