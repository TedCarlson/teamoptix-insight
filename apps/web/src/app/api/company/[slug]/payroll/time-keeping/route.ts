import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type EventRow = {
  roster_member_id: string | null;
  service_date: string;
  event_type: string;
  occurred_at: string;
};

type RosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
};

type DswDriverHourRow = {
  batch_id: string;
  service_date: string;
  source_row_index: number;
  roster_member_id: string | null;
  person_name: string | null;
  worker_type: string | null;
  dswid: string | null;
  driver_name: string | null;
  route_name: string | null;
  wa_number: string | null;
  on_duty_hours: string | null;
  on_road_hours: string | null;
  potential_dot_hours_violations: number | null;
  next_available_on_duty: string | null;
};

function timeTextToHours(value: string | null) {
  if (!value) return null;

  const [hoursRaw, minutesRaw = "0"] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return Number((hours + minutes / 60).toFixed(2));
}


export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const weekEnd =
      req.nextUrl.searchParams.get("weekEnd") ?? new Date().toISOString().slice(0, 10);

    const start = new Date(`${weekEnd}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    const weekStart = start.toISOString().slice(0, 10);

    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: events, error: eventsErr } = await sb
      .from("driver_activity_event_v")
      .select("roster_member_id, service_date, event_type, occurred_at")
      .eq("company_id", company.id)
      .gte("service_date", weekStart)
      .lte("service_date", weekEnd)
      .order("service_date")
      .order("occurred_at");

    if (eventsErr) {
      return NextResponse.json({ error: eventsErr.message }, { status: 500 });
    }

    const { data: roster, error: rosterErr } = await sb
      .from("company_roster_view")
      .select("roster_member_id, full_name, worker_type")
      .eq("company_id", company.id);

    if (rosterErr) {
      return NextResponse.json({ error: rosterErr.message }, { status: 500 });
    }

    const rosterMap = new Map(
      ((roster ?? []) as RosterRow[]).map((row) => [row.roster_member_id, row])
    );

    const grouped = new Map<string, EventRow[]>();

    for (const row of (events ?? []) as EventRow[]) {
      if (!row.roster_member_id) continue;
      const key = `${row.roster_member_id}|${row.service_date}`;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }

    const rows = [...grouped.entries()].map(([key, eventRows]) => {
      const [rosterMemberId, serviceDate] = key.split("|");
      const clockIn = eventRows.find((event) => event.event_type === "CLOCK_IN") ?? null;
      const clockOut =
        [...eventRows].reverse().find((event) => event.event_type === "CLOCK_OUT") ?? null;

      return {
        roster_member_id: rosterMemberId,
        service_date: serviceDate,
        full_name: rosterMap.get(rosterMemberId)?.full_name ?? null,
        worker_type: rosterMap.get(rosterMemberId)?.worker_type ?? null,
        clock_in: clockIn?.occurred_at ?? null,
        clock_out: clockOut?.occurred_at ?? null,
        state: clockOut ? "CLOCKED_OUT" : clockIn ? "CLOCKED_IN" : "NONE",
        event_count: eventRows.length,
      };
    });

    rows.sort((a, b) => {
      if (a.service_date !== b.service_date) {
        return b.service_date.localeCompare(a.service_date);
      }

      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });

    const { data: dswDriverRows, error: dswDriverError } = await sb.rpc(
      "get_payroll_time_tracking_dsw_rows",
      {
        p_company_id: company.id,
        p_week_start: weekStart,
        p_week_end: weekEnd,
      }
    );

    if (dswDriverError) {
      return NextResponse.json({ error: dswDriverError.message }, { status: 500 });
    }

    const dswRows = ((dswDriverRows ?? []) as DswDriverHourRow[]).map((row) => ({
      batch_id: row.batch_id,
      service_date: row.service_date,
      source_row_index: row.source_row_index,
      roster_member_id: row.roster_member_id,
      person_name: row.person_name,
      worker_type: row.worker_type,
      dswid: row.dswid,
      driver_name: row.driver_name,
      route_name: row.route_name,
      wa_number: row.wa_number,
      on_duty_hours: timeTextToHours(row.on_duty_hours),
      on_road_hours: timeTextToHours(row.on_road_hours),
      potential_dot_hours_violations: row.potential_dot_hours_violations,
      next_available_on_duty: row.next_available_on_duty,
    }));

    return NextResponse.json({
      week_start: weekStart,
      week_end: weekEnd,
      rows,
      driver_rows: rows,
      dsw_rows: dswRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
