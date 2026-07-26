import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getAutomationCredential,
  getOrCreateFedExAutomationProfile,
  resolveAutomationAccess,
  resolveCompanyBySlug,
  saveAutomationCredential,
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

    const profileResult =
      await getOrCreateFedExAutomationProfile(
        supabase,
        resolved.company.id
      );

    if (!profileResult.profile) {
      return NextResponse.json(
        { error: profileResult.error ?? "Profile not found." },
        { status: 500 }
      );
    }

    const credential =
      await getAutomationCredential(
        supabase,
        profileResult.profile.id
      );

    if (credential.error) {
      return NextResponse.json(
        { error: credential.error },
        { status: 500 }
      );
    }

    return NextResponse.json(
      credential.row ?? {
        username: "",
        has_secret: false,
        last_verified_at: null,
        last_verification_result: null,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load credentials.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const body = await req.json();

    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

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

    const profileResult =
      await getOrCreateFedExAutomationProfile(
        supabase,
        resolved.company.id
      );

    if (!profileResult.profile) {
      return NextResponse.json(
        { error: profileResult.error ?? "Profile not found." },
        { status: 500 }
      );
    }

    const saveResult =
      await saveAutomationCredential(
        createSupabaseServiceRoleClient(),
        profileResult.profile.id,
        username,
        password
      );

    if (saveResult.error) {
      return NextResponse.json(
        { error: saveResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save credentials.",
      },
      { status: 500 }
    );
  }
}
