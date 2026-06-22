import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
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

    if (resolved.error || !resolved.company) {
      return NextResponse.json(
        { error: resolved.error ?? "Company not found." },
        { status: 404 }
      );
    }

    const result = await getOrCreateFedExAutomationProfile(
      supabase,
      resolved.company.id
    );

    if (result.error || !result.profile) {
      return NextResponse.json(
        { error: result.error ?? "Failed to load automation profile." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        provider_key: result.profile.provider_key,
        status: result.profile.status,
        profile_id: result.profile.id,
        updated_at: result.profile.updated_at,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load automation status.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
