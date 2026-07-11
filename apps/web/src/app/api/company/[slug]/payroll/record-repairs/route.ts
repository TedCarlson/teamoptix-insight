import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isDriverType } from "@/features/payroll/lib/payroll.classification";

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

    const { data: activityRows, error: activityError } = await supabase
      .from("payroll_activity_fact_v")
      .select(
        "roster_member_id, person_name, service_date, source_kind, attendance_status, metadata_json"
      )
      .eq("company_id", company.id)
      .gte("service_date", weekStart)
      .lte("service_date", weekEnd)
      .eq("attendance_status", "present")
      .in("source_kind", [
        "DSW_ACTUAL",
        "DSW_OWNERSHIP",
        "DSW_CANDIDATE",
      ]);

    if (activityError) {
      return NextResponse.json(
        { error: activityError.message },
        { status: 500 }
      );
    }

    const activityByRosterId = new Map<
      string,
      {
        person_name: string;
        service_dates: Set<string>;
        source_row_count: number;
      }
    >();

    for (const row of activityRows ?? []) {
      if (!row.roster_member_id || !row.service_date) continue;

      const current = activityByRosterId.get(row.roster_member_id) ?? {
        person_name: row.person_name ?? "Unnamed driver",
        service_dates: new Set<string>(),
        source_row_count: 0,
      };

      current.service_dates.add(row.service_date);

      const metadata = row.metadata_json as
        | Record<string, unknown>
        | null
        | undefined;

      const sourceRowCount = Number(metadata?.source_row_count ?? 1);

      current.source_row_count +=
        Number.isFinite(sourceRowCount) && sourceRowCount > 0
          ? sourceRowCount
          : 1;

      activityByRosterId.set(row.roster_member_id, current);
    }

    const rosterIds = Array.from(activityByRosterId.keys());

    if (rosterIds.length === 0) {
      return NextResponse.json(
        {
          week_start: weekStart,
          week_end: weekEnd,
          repairs: [],
        },
        { status: 200 }
      );
    }

    const { data: rosterRows, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, full_name, worker_type")
      .eq("company_id", company.id)
      .in("roster_member_id", rosterIds);

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message },
        { status: 500 }
      );
    }

    const { data: operationsRows, error: operationsError } = await supabase
      .from("company_roster_operations_fact_v")
      .select("roster_id, daily_pay_rate, daily_pay_effective_date")
      .in("roster_id", rosterIds);

    if (operationsError) {
      return NextResponse.json(
        { error: operationsError.message },
        { status: 500 }
      );
    }

    const operationsByRosterId = new Map(
      (operationsRows ?? []).map((row) => [row.roster_id, row])
    );

    const repairs = (rosterRows ?? [])
      .filter((row) => isDriverType(row.worker_type))
      .map((row) => {
        const activity = activityByRosterId.get(row.roster_member_id);
        const operations = operationsByRosterId.get(row.roster_member_id);

        const dailyPayRate =
          operations?.daily_pay_rate == null
            ? null
            : Number(operations.daily_pay_rate);

        const dailyPayEffectiveDate =
          operations?.daily_pay_effective_date ?? null;

        const missingDailyPayRate =
          dailyPayRate == null || !Number.isFinite(dailyPayRate);

        const missingDailyPayEffectiveDate =
          !dailyPayEffectiveDate;

        const issueCodes: string[] = [];

        if (missingDailyPayRate) {
          issueCodes.push("MISSING_DAILY_PAY_RATE");
        }

        if (missingDailyPayEffectiveDate) {
          issueCodes.push("MISSING_DAILY_PAY_EFFECTIVE_DATE");
        }

        return {
          roster_member_id: row.roster_member_id,
          person_name:
            row.full_name ??
            activity?.person_name ??
            "Unnamed driver",
          daily_pay_rate: dailyPayRate,
          daily_pay_effective_date: dailyPayEffectiveDate,
          missing_daily_pay_rate: missingDailyPayRate,
          missing_daily_pay_effective_date:
            missingDailyPayEffectiveDate,
          issue_codes: issueCodes,
          affected_service_dates: Array.from(
            activity?.service_dates ?? []
          ).sort(),
          source_row_count: activity?.source_row_count ?? 0,
        };
      })
      .filter((row) => row.issue_codes.length > 0)
      .sort((a, b) => a.person_name.localeCompare(b.person_name));

    return NextResponse.json(
      {
        week_start: weekStart,
        week_end: weekEnd,
        repairs,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load payroll record repairs.",
      },
      { status: 500 }
    );
  }
}
