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

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", roster: [] },
        { status: 404 }
      );
    }

    const { data: roster, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("*")
      .eq("company_id", company.id)
      .order("full_name");

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message, roster: [] },
        { status: 500 }
      );
    }

    const baseRoster = roster ?? [];
    const rosterIds = baseRoster
      .map((row: any) => row.roster_member_id)
      .filter(Boolean);

    let stageByRosterId = new Map<string, any>();

    if (rosterIds.length > 0) {
      const { data: stageRows } = await supabase
        .from("roster_candidate_stage_v")
        .select("roster_id, stage_key, default_label, is_terminal, stage_sort_order")
        .eq("company_id", company.id)
        .in("roster_id", rosterIds);

      stageByRosterId = new Map(
        (stageRows ?? []).map((stage: any) => [stage.roster_id, stage])
      );
    }

    const hydratedRoster = baseRoster
      .map((row: any) => {
        const stage = stageByRosterId.get(row.roster_member_id);

        return {
          ...row,
          candidate_stage_key: stage?.stage_key ?? null,
          candidate_stage_label: stage?.default_label ?? null,
          candidate_stage_is_terminal: Boolean(stage?.is_terminal ?? false),
        };
      })
      .filter((row: any) => {
        if (row.employment_status !== "Candidate") return true;
        return row.candidate_stage_is_terminal !== true;
      });

    return NextResponse.json(
      {
        company_id: company.id,
        roster: hydratedRoster,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Roster query failed.";

    return NextResponse.json(
      { error: message, roster: [] },
      { status: 500 }
    );
  }
}