import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RosterRow = {
  roster_member_id: string;
  full_name: string | null;
};

type BaselineRow = {
  id: string;
  roster_member_id: string;
  preset_id: string | null;
  rotation_mode: string | null;
  anchor_date: string | null;
  default_route_s: string | null;
  default_route_u: string | null;
  default_route_m: string | null;
  default_route_t: string | null;
  default_route_w: string | null;
  default_route_h: string | null;
  default_route_f: string | null;
};

type PresetRow = {
  id: string;
  preset_code: string;
  works_s: boolean;
  works_u: boolean;
  works_m: boolean;
  works_t: boolean;
  works_w: boolean;
  works_h: boolean;
  works_f: boolean;
  uses_rotation: boolean;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", rows: [] },
        { status: 404 }
      );
    }

    const { data: rosterData, error: rosterErr } = await sb
      .from("company_roster_view")
      .select("roster_member_id, full_name")
      .eq("company_id", company.id)
      .eq("employment_status", "Active")
      .order("full_name");

    if (rosterErr) {
      return NextResponse.json(
        { error: rosterErr.message, rows: [] },
        { status: 500 }
      );
    }

    const rosterRows = (rosterData ?? []) as RosterRow[];
    const rosterIds = rosterRows
      .map((row) => row.roster_member_id)
      .filter(Boolean);

    let baselineRows: BaselineRow[] = [];

    if (rosterIds.length > 0) {
      const { data: baselineData, error: baselineErr } = await sb
        .from("schedule_baseline")
        .select(`
          id,
          roster_member_id,
          preset_id,
          rotation_mode,
          anchor_date,
          default_route_s,
          default_route_u,
          default_route_m,
          default_route_t,
          default_route_w,
          default_route_h,
          default_route_f
        `)
        .eq("company_id", company.id)
        .is("effective_end", null)
        .eq("is_active", true)
        .in("roster_member_id", rosterIds);

      if (baselineErr) {
        return NextResponse.json(
          { error: baselineErr.message, rows: [] },
          { status: 500 }
        );
      }

      baselineRows = (baselineData ?? []) as BaselineRow[];
    }

    const presetIds = Array.from(
      new Set(
        baselineRows
          .map((row) => row.preset_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    let presetRows: PresetRow[] = [];

    if (presetIds.length > 0) {
      const { data: presetData, error: presetErr } = await sb
        .from("schedule_preset")
        .select(`
          id,
          preset_code,
          works_s,
          works_u,
          works_m,
          works_t,
          works_w,
          works_h,
          works_f,
          uses_rotation
        `)
        .eq("company_id", company.id)
        .eq("is_active", true)
        .in("id", presetIds);

      if (presetErr) {
        return NextResponse.json(
          { error: presetErr.message, rows: [] },
          { status: 500 }
        );
      }

      presetRows = (presetData ?? []) as PresetRow[];
    }

    const baselineByRosterId = new Map<string, BaselineRow>();
    for (const row of baselineRows) {
      if (!baselineByRosterId.has(row.roster_member_id)) {
        baselineByRosterId.set(row.roster_member_id, row);
      }
    }

    const presetById = new Map<string, PresetRow>();
    for (const row of presetRows) {
      presetById.set(row.id, row);
    }

    const rows = rosterRows.map((roster) => {
      const baseline = baselineByRosterId.get(roster.roster_member_id) ?? null;
      const preset =
        baseline?.preset_id != null
          ? presetById.get(baseline.preset_id) ?? null
          : null;

      return {
        roster_member_id: roster.roster_member_id,
        full_name: roster.full_name ?? "Unnamed worker",
        tech_id: null,

        preset_id: baseline?.preset_id ?? null,
        preset_code: preset?.preset_code ?? null,

        preset_works_s: preset?.works_s ?? null,
        preset_works_u: preset?.works_u ?? null,
        preset_works_m: preset?.works_m ?? null,
        preset_works_t: preset?.works_t ?? null,
        preset_works_w: preset?.works_w ?? null,
        preset_works_h: preset?.works_h ?? null,
        preset_works_f: preset?.works_f ?? null,

        rotation_mode: baseline?.rotation_mode ?? null,

        default_route_s: baseline?.default_route_s ?? null,
        default_route_u: baseline?.default_route_u ?? null,
        default_route_m: baseline?.default_route_m ?? null,
        default_route_t: baseline?.default_route_t ?? null,
        default_route_w: baseline?.default_route_w ?? null,
        default_route_h: baseline?.default_route_h ?? null,
        default_route_f: baseline?.default_route_f ?? null,

        schedule_pending: !baseline?.preset_id,
      };
    });

    return NextResponse.json({
      company_id: company.id,
      rows,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load schedule.";

    return NextResponse.json(
      { error: message, rows: [] },
      { status: 500 }
    );
  }
}