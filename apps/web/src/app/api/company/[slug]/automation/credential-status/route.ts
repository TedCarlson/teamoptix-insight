import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAutomationCredential,
  getOrCreateFedExAutomationProfile,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

export async function GET(
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

    const credential = await getAutomationCredential(
      supabase,
      profileResult.profile.id
    );

    if (credential.error) {
      return NextResponse.json(
        { error: credential.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      has_secret: Boolean(credential.row?.has_secret),
      last_verified_at: credential.row?.last_verified_at ?? null,
      last_verification_result:
        credential.row?.last_verification_result ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load credential status.",
      },
      { status: 500 }
    );
  }
}
