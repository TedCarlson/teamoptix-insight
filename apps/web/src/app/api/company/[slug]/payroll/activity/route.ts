import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PayrollActivityRow } from "@/features/payroll/lib/payroll.types";

export const runtime = "nodejs";

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}


function dswBridgeKey(value: unknown) {
  const raw = String(value ?? "").toUpperCase().trim();
  if (!raw) return "";

  if (raw.includes(",")) {
    const [lastRaw, restRaw = ""] = raw.split(",");
    const last = lastRaw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
    const first = restRaw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
    return last && first ? `${last}|${first}` : "";
  }

  const parts = raw
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length < 2) return "";

  const first = parts[0];
  const last = parts[parts.length - 1];

  return last && first ? `${last}|${first}` : "";
}


function isDswPayrollSource(sourceKind: string | null | undefined) {
  return sourceKind === "DSW_ACTUAL" || sourceKind === "DSW_OWNERSHIP";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const weekEnd = req.nextUrl.searchParams.get("weekEnd");

    if (!weekEnd) {
      return NextResponse.json(
        { error: "weekEnd is required." },
        { status: 400 }
      );
    }

    const weekStart = addDays(weekEnd, -6);
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    const { data: facts, error: factsError } = await supabase
      .from("payroll_activity_fact_v")
      .select(
        [
          "service_date",
          "roster_member_id",
          "person_name",
          "attendance_status",
          "daily_pay_rate",
          "daily_pay_eligible",
          "source_kind",
          "route_name",
          "wa_number",
          "vehicle_text",
          "actual_delivery_stops",
          "actual_delivery_packages",
          "actual_pickup_stops",
          "actual_pickup_packages",
          "threshold_stops",
          "threshold_rate",
          "threshold_overage",
          "threshold_pay_amount",
          "review_flags",
        ].join(",")
      )
      .eq("company_id", company.id)
      .gte("service_date", weekStart)
      .lte("service_date", weekEnd);

    if (factsError) {
      return NextResponse.json(
        { error: factsError.message },
        { status: 500 }
      );
    }

    const rawRows = (facts ?? []) as unknown as PayrollActivityRow[];
    const { data: rosterRows, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, full_name, worker_type, dswid")
      .eq("company_id", company.id);

    if (rosterError) {
      return NextResponse.json({ error: rosterError.message }, { status: 500 });
    }

    const rosterIds = (rosterRows ?? [])
      .map((row) => row.roster_member_id)
      .filter((id): id is string => Boolean(id));

    const { data: opsRows, error: opsError } = rosterIds.length
      ? await supabase
          .from("company_roster_operations_fact_v")
          .select("roster_id, daily_pay_rate, daily_pay_effective_date")
          .in("roster_id", rosterIds)
      : { data: [], error: null };

    if (opsError) {
      return NextResponse.json({ error: opsError.message }, { status: 500 });
    }

    const opsByRosterId = new Map<
      string,
      { daily_pay_rate: number | null; daily_pay_effective_date: string | null }
    >();

    for (const row of opsRows ?? []) {
      if (!row.roster_id) continue;
      opsByRosterId.set(row.roster_id, {
        daily_pay_rate: row.daily_pay_rate == null ? null : Number(row.daily_pay_rate),
        daily_pay_effective_date: row.daily_pay_effective_date ?? null,
      });
    }

    const rosterByDswBridge = new Map<
      string,
      {
        roster_member_id: string;
        full_name: string | null;
        dswid: string | null;
        daily_pay_rate: number | null;
        daily_pay_effective_date: string | null;
      }
    >();

    for (const row of rosterRows ?? []) {
      const key = dswBridgeKey(row.dswid);
      if (!key || !row.roster_member_id) continue;
      const ops = opsByRosterId.get(row.roster_member_id) ?? {
        daily_pay_rate: null,
        daily_pay_effective_date: null,
      };

      rosterByDswBridge.set(key, {
        roster_member_id: row.roster_member_id,
        full_name: row.full_name ?? null,
        dswid: row.dswid ?? null,
        daily_pay_rate: ops.daily_pay_rate,
        daily_pay_effective_date: ops.daily_pay_effective_date,
      });
    }

    let dswBridgeMatches = 0;

    const rows = rawRows.map((row) => {
      if (row.roster_member_id) return row;

      const match = rosterByDswBridge.get(dswBridgeKey(row.person_name));
      if (!match) return row;

      dswBridgeMatches += 1;

      return {
        ...row,
        roster_member_id: match.roster_member_id,
        person_name: match.full_name ?? row.person_name,
        daily_pay_eligible:
          row.daily_pay_eligible === true ||
          (match.daily_pay_rate != null &&
            match.daily_pay_effective_date != null &&
            match.daily_pay_effective_date <= row.service_date),
        daily_pay_rate: row.daily_pay_rate ?? match.daily_pay_rate,
        daily_pay_effective_date:
          row.daily_pay_effective_date ?? match.daily_pay_effective_date,
        review_flags: (row.review_flags ?? []).filter(
          (flag) =>
            !["UNMATCHED", "UNMATCHED_DSW_DRIVER", "UNMATCHED_REVIEW"].includes(flag)
        ),
      };
    });

    const people = new Map<string, { id: string | null; name: string; days: Map<string, number>; thresholdPay: number }>();

    for (const row of rows as any[]) {
      const personKey =
        row.roster_member_id ?? row.person_name ?? `unknown-${row.service_date}`;
      const person = people.get(personKey) ?? {
        id: row.roster_member_id ?? null,
        name: row.person_name ?? "Unmatched",
        days: new Map<string, number>(),
        thresholdPay: 0,
      };

      if (
        row.attendance_status === "present" &&
        row.daily_pay_eligible &&
        row.daily_pay_rate != null
      ) {
        const current = person.days.get(row.service_date);
        const rate = Number(row.daily_pay_rate);
        person.days.set(row.service_date, Math.max(current ?? 0, rate));
      }

      if (isDswPayrollSource(row.source_kind) && row.threshold_pay_amount != null) {
        person.thresholdPay += Number(row.threshold_pay_amount);
      }

      people.set(personKey, person);
    }

    const summary = Array.from(people.values()).map((person) => {
      const dailyPay = Array.from(person.days.values()).reduce(
        (sum, value) => sum + value,
        0
      );

      return {
        roster_member_id: person.id,
        person_name: person.name,
        days_worked: person.days.size,
        worked_days: Array.from(person.days.keys()).sort(),
        daily_pay_total: dailyPay,
        threshold_pay_total: person.thresholdPay,
        estimated_total: dailyPay + person.thresholdPay,
      };
    });

    const estimatedPayroll = summary.reduce(
      (sum, row) => sum + row.estimated_total,
      0
    );
    const estimatedThresholdPay = summary.reduce(
      (sum, row) => sum + row.threshold_pay_total,
      0
    );

    return NextResponse.json({
      company_id: company.id,
      week_start: weekStart,
      week_end: weekEnd,
      record_count: summary.length,
      estimated_payroll: estimatedPayroll,
      estimated_threshold_pay: estimatedThresholdPay,
      summary,
      activity: rows,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Payroll activity query failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
