import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type ScheduleFactRow = {
  id: string;
  company_id: string;
  terminal_id: string;
  service_date: string;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: string | null;
  market_code: string | null;
  reports_to_name: string | null;
  planned_on: boolean;
  route_name: string | null;
  source_kind: string;
  preset_id: string | null;
  preset_code: string | null;
  rotation_mode: string | null;
  anchor_date: string | null;
  baseline_id: string | null;
  override_id: string | null;
  override_type: string | null;
  override_start_date: string | null;
  override_end_date: string | null;
  route_name_override: string | null;
  created_at: string;
};

type ProjectionRow = {
  company_id: string;
  terminal_id: string;
  service_date: string;
  roster_member_id: string;
  planned_on: boolean;
  route_name: string | null;
  source_kind: string;
  preset_id: string | null;
  rotation_mode: string | null;
  anchor_date: string | null;
  baseline_id: string | null;
  override_id: string | null;
};

type RosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: string | null;
  market_code: string | null;
  reports_to_name: string | null;
};

type PresetRow = {
  id: string;
  preset_code: string | null;
};

type OverrideRow = {
  id: string;
  override_type: string | null;
  start_date: string | null;
  end_date: string | null;
  route_name_override: string | null;
};

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function utcDateValue(value: string) {
  return new Date(`${value}T00:00:00Z`).getTime();
}

function inclusiveDayCount(startDate: string, endDate: string) {
  return Math.floor(
    (utcDateValue(endDate) - utcDateValue(startDate)) / 86_400_000
  ) + 1;
}

function uniqueIds(values: Array<string | null>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const serviceDate = req.nextUrl.searchParams.get("date");
    const startDate = req.nextUrl.searchParams.get("start_date");
    const endDate = req.nextUrl.searchParams.get("end_date");

    if (serviceDate && !isIsoDate(serviceDate)) {
      return NextResponse.json(
        { error: "date must use YYYY-MM-DD format.", rows: [] },
        { status: 400 }
      );
    }

    if (startDate && !isIsoDate(startDate)) {
      return NextResponse.json(
        { error: "start_date must use YYYY-MM-DD format.", rows: [] },
        { status: 400 }
      );
    }

    if (endDate && !isIsoDate(endDate)) {
      return NextResponse.json(
        { error: "end_date must use YYYY-MM-DD format.", rows: [] },
        { status: 400 }
      );
    }

    const projectionStart = serviceDate ?? startDate;
    const projectionEnd = serviceDate ?? endDate;
    const hasBoundedWindow = Boolean(projectionStart && projectionEnd);

    if (
      projectionStart &&
      projectionEnd &&
      utcDateValue(projectionEnd) < utcDateValue(projectionStart)
    ) {
      return NextResponse.json(
        { error: "end_date must be on or after start_date.", rows: [] },
        { status: 400 }
      );
    }

    const horizonDays =
      projectionStart && projectionEnd
        ? inclusiveDayCount(projectionStart, projectionEnd)
        : null;

    if (horizonDays != null && horizonDays > 366) {
      return NextResponse.json(
        {
          error: "Generated schedule requests cannot exceed 366 days.",
          rows: [],
        },
        { status: 400 }
      );
    }

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

    let query = sb
      .from("schedule_day_fact_view")
      .select("*")
      .eq("company_id", company.id);

    if (serviceDate) {
      query = query.eq("service_date", serviceDate);
    } else {
      if (startDate) query = query.gte("service_date", startDate);
      if (endDate) query = query.lte("service_date", endDate);
    }

    const { data: factData, error: factError } = await query
      .order("service_date", { ascending: true })
      .order("full_name", { ascending: true })
      .limit(5000);

    if (factError) {
      return NextResponse.json(
        { error: factError.message, rows: [] },
        { status: 500 }
      );
    }

    const facts = (factData ?? []) as ScheduleFactRow[];

    if (
      !hasBoundedWindow ||
      !projectionStart ||
      !projectionEnd ||
      horizonDays == null
    ) {
      return NextResponse.json({
        company_id: company.id,
        rows: facts.map((row) => ({
          ...row,
          resolution_source: "FACT" as const,
        })),
      });
    }

    const factKeys = new Set(
      facts.map(
        (row) => `${row.service_date}:${row.roster_member_id}`
      )
    );

    const { data: projectionData, error: projectionError } = await sb.rpc(
      "resolve_schedule_projection",
      {
        p_company_id: company.id,
        p_start_date: projectionStart,
        p_horizon_days: horizonDays,
      }
    );

    if (projectionError) {
      return NextResponse.json(
        {
          error: projectionError.message,
          rows: [],
          step: "resolve_schedule_projection",
        },
        { status: 500 }
      );
    }

    const projectedRows = ((projectionData ?? []) as ProjectionRow[]).filter(
      (row) =>
        !factKeys.has(`${row.service_date}:${row.roster_member_id}`)
    );

    if (projectedRows.length === 0) {
      return NextResponse.json({
        company_id: company.id,
        rows: facts.map((row) => ({
          ...row,
          resolution_source: "FACT" as const,
        })),
      });
    }

    const rosterIds = uniqueIds(
      projectedRows.map((row) => row.roster_member_id)
    );
    const presetIds = uniqueIds(projectedRows.map((row) => row.preset_id));
    const overrideIds = uniqueIds(projectedRows.map((row) => row.override_id));

    const [rosterResult, presetResult, overrideResult] = await Promise.all([
      rosterIds.length > 0
        ? sb
            .from("company_roster_view")
            .select(
              "roster_member_id, full_name, worker_type, employment_status, market_code, reports_to_name"
            )
            .eq("company_id", company.id)
            .in("roster_member_id", rosterIds)
        : Promise.resolve({ data: [] as RosterRow[], error: null }),

      presetIds.length > 0
        ? sb
            .from("schedule_preset")
            .select("id, preset_code")
            .eq("company_id", company.id)
            .in("id", presetIds)
        : Promise.resolve({ data: [] as PresetRow[], error: null }),

      overrideIds.length > 0
        ? sb
            .from("schedule_override")
            .select(
              "id, override_type, start_date, end_date, route_name_override"
            )
            .eq("company_id", company.id)
            .in("id", overrideIds)
        : Promise.resolve({ data: [] as OverrideRow[], error: null }),
    ]);

    const enrichmentError =
      rosterResult.error ?? presetResult.error ?? overrideResult.error;

    if (enrichmentError) {
      return NextResponse.json(
        {
          error: enrichmentError.message,
          rows: [],
          step: "enrich_schedule_projection",
        },
        { status: 500 }
      );
    }

    const rosterById = new Map(
      ((rosterResult.data ?? []) as RosterRow[]).map((row) => [
        row.roster_member_id,
        row,
      ])
    );

    const presetById = new Map(
      ((presetResult.data ?? []) as PresetRow[]).map((row) => [row.id, row])
    );

    const overrideById = new Map(
      ((overrideResult.data ?? []) as OverrideRow[]).map((row) => [row.id, row])
    );

    const projections = projectedRows.map((row) => {
      const roster = rosterById.get(row.roster_member_id);
      const preset = row.preset_id
        ? presetById.get(row.preset_id)
        : undefined;
      const override = row.override_id
        ? overrideById.get(row.override_id)
        : undefined;

      return {
        id: null,
        ...row,
        full_name: roster?.full_name ?? null,
        worker_type: roster?.worker_type ?? null,
        employment_status: roster?.employment_status ?? null,
        market_code: roster?.market_code ?? null,
        reports_to_name: roster?.reports_to_name ?? null,
        preset_code: preset?.preset_code ?? null,
        override_type: override?.override_type ?? null,
        override_start_date: override?.start_date ?? null,
        override_end_date: override?.end_date ?? null,
        route_name_override: override?.route_name_override ?? null,
        created_at: null,
        resolution_source: "PROJECTED" as const,
      };
    });

    const rows = [
      ...facts.map((row) => ({
        ...row,
        resolution_source: "FACT" as const,
      })),
      ...projections,
    ].sort((a, b) => {
      const dateCompare = a.service_date.localeCompare(b.service_date);
      if (dateCompare !== 0) return dateCompare;

      return String(a.full_name ?? "").localeCompare(
        String(b.full_name ?? ""),
        undefined,
        { sensitivity: "base" }
      );
    });

    return NextResponse.json({
      company_id: company.id,
      rows,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load generated schedule.";

    return NextResponse.json(
      { error: message, rows: [] },
      { status: 500 }
    );
  }
}
