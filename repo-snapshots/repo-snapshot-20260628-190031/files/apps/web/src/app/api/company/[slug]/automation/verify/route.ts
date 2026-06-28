import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  recordAutomationCredentialVerification,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { verifyFedExCredential } from "@/features/automation/server/automation.verify";

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
      return NextResponse.json(
        { error: resolved.error ?? "Company not found." },
        { status: 404 }
      );
    }

    const profileResult = await getOrCreateFedExAutomationProfile(
      supabase,
      resolved.company.id
    );

    if (!profileResult.profile) {
      return NextResponse.json(
        { error: profileResult.error ?? "Profile not found." },
        { status: 500 }
      );
    }

    const credentialResult = await getAutomationCredentialForVerify(
      supabase,
      profileResult.profile.id
    );

    if (!credentialResult.row) {
      return NextResponse.json(
        { error: credentialResult.error ?? "No credential saved." },
        { status: 400 }
      );
    }

    const verification = await verifyFedExCredential({
      username: credentialResult.row.username,
      password: credentialResult.row.encrypted_secret,
    });

    await recordAutomationCredentialVerification(
      supabase,
      profileResult.profile.id,
      verification.result,
      verification.status
    );

    return NextResponse.json(verification, {
      status: verification.ok ? 200 : 409,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        result: "BROWSER_ERROR",
        status: "WARNING",
        message:
          error instanceof Error
            ? error.message
            : "Verification failed.",
      },
      { status: 500 }
    );
  }
}
