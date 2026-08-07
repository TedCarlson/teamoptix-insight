import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildWorkforceTenureProfile } from "@/features/company/analytics/workforce/workforceTenure";
import { buildResignationNoticeCountdowns } from "@/features/company/analytics/workforce/resignationNotice";

export const runtime = "nodejs";

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type ExpressRow = {
  service_date: string;
  route_key: string;
  express_package_count: number | string | null;
  express_stop_count: number | string | null;
  incomplete_express_package_count: number | string | null;
};

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const endDate = request.nextUrl.searchParams.get("end");

    if (!isIsoDate(endDate)) {
      return NextResponse.json(
        { error: "A valid dashboard through date is required." },
        { status: 400 }
      );
    }

    // Express is not part of the DSW history payload. Keep this supplemental
    // read intentionally bounded to the recent six calendar weeks.
    const expressStart = addDays(endDate, -41);
    const supabase = await getSupabaseServerClient();
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const [rosterResult, expressResult, noticeResult] = await Promise.all([
      supabase
        .from("company_roster_view")
        .select("roster_member_id, full_name, worker_type, employment_status, hire_date")
        .eq("company_id", company.id),
      supabase
        .from("operations_manifest_route_health_v")
        .select(
          "service_date, route_key, express_package_count, express_stop_count, incomplete_express_package_count"
        )
        .eq("company_id", company.id)
        .gte("service_date", expressStart)
        .lte("service_date", endDate),
      supabase
        .from("schedule_override")
        .select(
          "id, roster_member_id, override_type, start_date, end_date, separation_effective_date, workflow_status, is_active"
        )
        .eq("company_id", company.id)
        .eq("override_type", "RESIGNATION_NOTICE")
        .eq("is_active", true),
    ]);

    if (rosterResult.error) {
      return NextResponse.json({ error: rosterResult.error.message }, { status: 500 });
    }
    if (noticeResult.error) {
      return NextResponse.json({ error: noticeResult.error.message }, { status: 500 });
    }

    const roster = rosterResult.data ?? [];
    const activeDrivers = roster.filter((row) => row.employment_status === "Active").length;
    const trainees = roster.filter((row) => row.employment_status === "Trainee").length;
    const tenure = buildWorkforceTenureProfile(roster, endDate);
    const noticeAsOf = new Date().toISOString().slice(0, 10);
    const noticeResignations = buildResignationNoticeCountdowns(
      noticeResult.data ?? [],
      roster,
      noticeAsOf
    );

    // A route/day can appear under more than one capture plan. Retain the
    // largest observed counts for that route/day rather than double-counting.
    const routeDays = new Map<string, ExpressRow>();
    for (const row of (expressResult.data ?? []) as ExpressRow[]) {
      const key = `${row.service_date}|${row.route_key}`;
      const current = routeDays.get(key);
      if (!current) {
        routeDays.set(key, row);
        continue;
      }
      routeDays.set(key, {
        ...row,
        express_package_count: Math.max(
          number(current.express_package_count),
          number(row.express_package_count)
        ),
        express_stop_count: Math.max(
          number(current.express_stop_count),
          number(row.express_stop_count)
        ),
        incomplete_express_package_count: Math.max(
          number(current.incomplete_express_package_count),
          number(row.incomplete_express_package_count)
        ),
      });
    }

    const expressRows = Array.from(routeDays.values());
    const expressDates = new Set(expressRows.map((row) => row.service_date));

    return NextResponse.json({
      workforce: {
        active_drivers: activeDrivers,
        trainees,
        tenure,
        notice_as_of: noticeAsOf,
        notice_resignations: noticeResignations,
      },
      express: {
        start_date: expressStart,
        end_date: endDate,
        coverage_days: expressDates.size,
        route_days: expressRows.length,
        packages: expressRows.reduce(
          (sum, row) => sum + number(row.express_package_count),
          0
        ),
        stops: expressRows.reduce(
          (sum, row) => sum + number(row.express_stop_count),
          0
        ),
        open_packages: expressRows.reduce(
          (sum, row) => sum + number(row.incomplete_express_package_count),
          0
        ),
        available: !expressResult.error && expressRows.length > 0,
        error: expressResult.error?.message ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare dashboard context.",
      },
      { status: 500 }
    );
  }
}
