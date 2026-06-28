import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase.rpc("get_company_access_config", {
      p_company_slug: slug,
    });

    if (error) {
      return NextResponse.json({ error: error.message, people: [] }, { status: 500 });
    }

    if (data?.error) {
      return NextResponse.json({ error: data.error, people: [] }, { status: data.error === "Forbidden." ? 403 : 404 });
    }

    return NextResponse.json(data ?? { people: [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load access config.";
    return NextResponse.json({ error: message, people: [] }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const profileId = typeof body.profile_id === "string" ? body.profile_id : "";
    const grants = Array.isArray(body.grants)
      ? body.grants.filter((grant: unknown): grant is string => typeof grant === "string")
      : [];

    if (!profileId) {
      return NextResponse.json({ error: "profile_id is required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("update_company_profile_grants", {
      p_company_slug: slug,
      p_profile_id: profileId,
      p_grant_keys: grants,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: data.error === "Forbidden." ? 403 : 400 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update grants.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
