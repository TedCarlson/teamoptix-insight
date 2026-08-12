import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getAutomationCredentialForVerify,
  getOrCreateFedExAutomationProfile,
  recordAutomationCredentialVerification,
  resolveAutomationAccess,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.canAdmin) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.allowed ? 403 : access.status }
      );
    }

    const resolved = await resolveCompanyBySlug(supabase, slug);

    if (!resolved.company) {
      return NextResponse.json(
        { error: resolved.error ?? "Company not found." },
        { status: 404 }
      );
    }

    const admin = createSupabaseServiceRoleClient();
    const profileResult = await getOrCreateFedExAutomationProfile(
      admin,
      resolved.company.id
    );

    if (!profileResult.profile) {
      return NextResponse.json(
        { error: profileResult.error ?? "Profile not found." },
        { status: 500 }
      );
    }

    const credentialResult = await getAutomationCredentialForVerify(
      admin,
      profileResult.profile.id
    );

    if (!credentialResult.row) {
      return NextResponse.json(
        { error: credentialResult.error ?? "No credential saved." },
        { status: 400 }
      );
    }

    // Keep Playwright outside route-module initialization. If the browser
    // runtime is unavailable, this import fails inside the JSON error boundary
    // instead of Next.js returning an HTML 500 page to the admin client.
    const { verifyFedExCredential } = await import(
      "@/features/automation/server/automation.verify"
    );
    const verification = await verifyFedExCredential({
      username: credentialResult.row.username,
      password: credentialResult.row.encrypted_secret,
    });

    await recordAutomationCredentialVerification(
      admin,
      profileResult.profile.id,
      verification.result,
      verification.status
    );

    return NextResponse.json(verification, {
      status: verification.ok ? 200 : 409,
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Verification failed.";
    const browserRuntimeUnavailable =
      rawMessage.includes("playwright-core") || rawMessage.includes("browsers.json");
    return NextResponse.json(
      {
        ok: false,
        result: "BROWSER_ERROR",
        status: "WARNING",
        message: browserRuntimeUnavailable
          ? "Connection testing could not start in the web runtime. The saved credential was not rejected."
          : rawMessage,
      },
      { status: 500 }
    );
  }
}
