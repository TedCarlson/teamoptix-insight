import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message === "Forbidden.") return 403;
  if (message === "Company not found.") return 404;
  return 400;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_company_leadership_config", { p_company_slug: slug });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load company leadership." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = body.action === "remove" ? "remove" : "add";

    if (action === "remove") {
      const assignmentId = typeof body.assignment_id === "string" ? body.assignment_id : "";
      if (!assignmentId) {
        return NextResponse.json({ error: "assignment_id is required." }, { status: 400 });
      }

      const supabase = await getSupabaseServerClient();
      const { data, error } = await supabase.rpc("remove_company_leadership_assignment", {
        p_company_slug: slug,
        p_assignment_id: assignmentId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
      return NextResponse.json(data, { status: 200 });
    }

    const roleKey = typeof body.role_key === "string" ? body.role_key : "";
    const rosterMemberId = body.roster_member_id === null || body.roster_member_id === ""
      ? null
      : typeof body.roster_member_id === "string" ? body.roster_member_id : undefined;
    const profileId = body.profile_id === null || body.profile_id === ""
      ? null
      : typeof body.profile_id === "string" ? body.profile_id : undefined;
    if (!roleKey || rosterMemberId === undefined || profileId === undefined) {
      return NextResponse.json({ error: "role_key, roster_member_id, and profile_id are required." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("update_company_leadership_assignment", {
      p_company_slug: slug,
      p_role_key: roleKey,
      p_roster_member_id: rosterMemberId,
      p_profile_id: profileId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update company leadership." },
      { status: 500 }
    );
  }
}
