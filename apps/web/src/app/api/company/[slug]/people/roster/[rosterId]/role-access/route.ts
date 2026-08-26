import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message === "Forbidden.") return 403;
  if (message === "Company not found." || message === "Roster member not found.") return 404;
  return 400;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> },
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_company_person_role_context", {
      p_company_slug: slug,
      p_roster_member_id: rosterId,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load role and access." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> },
) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const roleLabel = typeof body.role_label === "string" ? body.role_label.trim() : "";
    const leadershipRoleKey = body.leadership_role_key === null
      ? null
      : typeof body.leadership_role_key === "string"
        ? body.leadership_role_key
        : undefined;
    const grants = Array.isArray(body.grants)
      ? body.grants.filter((grant: unknown): grant is string => typeof grant === "string")
      : null;

    if (!roleLabel || leadershipRoleKey === undefined || !grants) {
      return NextResponse.json(
        { error: "role_label, leadership_role_key, and grants are required." },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("apply_company_person_role_change", {
      p_company_slug: slug,
      p_roster_member_id: rosterId,
      p_role_label: roleLabel,
      p_leadership_role_key: leadershipRoleKey,
      p_grant_keys: grants,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
    return NextResponse.json({ ok: true, context: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update role and access." },
      { status: 500 },
    );
  }
}
