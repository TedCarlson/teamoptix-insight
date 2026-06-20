import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

    const rows = facts ?? [];
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

      if (row.source_kind === "DSW_ACTUAL" && row.threshold_pay_amount != null) {
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
