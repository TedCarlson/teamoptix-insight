import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RosterRecord = {
  roster_member_id?: string | null;
  full_name?: string | null;
  [key: string]: unknown;
};

type BaselineRow = {
  id: string;
  roster_member_id: string;
  preset_id: string | null;
  rotation_mode: string | null;
  anchor_date: string | null;
  effective_start: string | null;
  rotation_works_s: boolean | null;
  rotation_works_u: boolean | null;
  rotation_works_m: boolean | null;
  rotation_works_t: boolean | null;
  rotation_works_w: boolean | null;
  rotation_works_h: boolean | null;
  rotation_works_f: boolean | null;
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

function normalizeRoleLabel(record: RosterRecord): string | null {
  const candidates = [
    record.role_label,
    record.role_name,
    record.role,
    record.worker_type,
    record.employee_type,
    record.position_type,
    record.position_title,
    record.job_title,
    record.labor_role,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function classifyRoleBucket(roleLabel: string | null): "DRIVER_HELPER" | "OTHER" {
  const value = (roleLabel ?? "").trim().toUpperCase();

  if (value.includes("DRIVER") || value.includes("HELPER")) {
    return "DRIVER_HELPER";
  }

  return "OTHER";
}

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
      .select("*")
      .eq("company_id", company.id)
      .in("employment_status", ["Active", "Trainee"])
      .order("full_name");

    if (rosterErr) {
      return NextResponse.json(
        { error: rosterErr.message, rows: [] },
        { status: 500 }
      );
    }

    const rosterRows = (rosterData ?? []) as RosterRecord[];
    const rosterIds = rosterRows
      .map((row) => row.roster_member_id)
      .filter((value): value is string => Boolean(value));

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
          effective_start,
          rotation_works_s,
          rotation_works_u,
          rotation_works_m,
          rotation_works_t,
          rotation_works_w,
          rotation_works_h,
          rotation_works_f,
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

    const rows = rosterRows
      .filter((roster): roster is RosterRecord & { roster_member_id: string } =>
        Boolean(roster.roster_member_id)
      )
      .map((roster) => {
        const baseline = baselineByRosterId.get(roster.roster_member_id) ?? null;
        const preset =
          baseline?.preset_id != null
            ? presetById.get(baseline.preset_id) ?? null
            : null;

        const roleLabel = normalizeRoleLabel(roster);
        const roleBucket = classifyRoleBucket(roleLabel);

        return {
          roster_member_id: roster.roster_member_id,
          profile_id:
            typeof roster.profile_id === "string"
              ? roster.profile_id
              : null,
          full_name:
            typeof roster.full_name === "string" && roster.full_name.trim()
              ? roster.full_name.trim()
              : "Unnamed worker",

          tech_id:
            typeof roster.tech_id === "string"
              ? roster.tech_id
              : typeof roster.tech_num === "string"
                ? roster.tech_num
                : null,

          role_label: roleLabel,
          role_bucket: roleBucket,
          employment_status:
            typeof roster.employment_status === "string"
              ? roster.employment_status
              : null,

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
          anchor_date: baseline?.anchor_date ?? null,
          effective_start: baseline?.effective_start ?? null,

          rotation_works_s: baseline?.rotation_works_s ?? false,
          rotation_works_u: baseline?.rotation_works_u ?? false,
          rotation_works_m: baseline?.rotation_works_m ?? false,
          rotation_works_t: baseline?.rotation_works_t ?? false,
          rotation_works_w: baseline?.rotation_works_w ?? false,
          rotation_works_h: baseline?.rotation_works_h ?? false,
          rotation_works_f: baseline?.rotation_works_f ?? false,

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
