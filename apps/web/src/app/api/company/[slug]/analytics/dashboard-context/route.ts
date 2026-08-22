import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
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
  package_count: number | string | null;
  complete_package_count: number | string | null;
  attempted_package_count: number | string | null;
  canonical_open_package_count: number | string | null;
  reference_match_available: boolean | null;
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
    const startDate = request.nextUrl.searchParams.get("start");
    const endDate = request.nextUrl.searchParams.get("end");

    if (
      !isIsoDate(startDate) ||
      !isIsoDate(endDate) ||
      startDate > endDate
    ) {
      return NextResponse.json(
        { error: "A valid dashboard calendar range is required." },
        { status: 400 }
      );
    }

    // Express is not part of the DSW history payload. Keep this supplemental
    // read intentionally bounded to the recent six calendar weeks.
    const sixWeekStart = addDays(endDate, -41);
    const expressStart =
      startDate > sixWeekStart ? startDate : sixWeekStart;
    const supabase = await getSupabaseServerClient();
    const serviceRole = createSupabaseServiceRoleClient();
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
      serviceRole
        .from("operations_manifest_express_route_signal_v")
        .select(
          "service_date, route_key, package_count, complete_package_count, attempted_package_count, canonical_open_package_count, reference_match_available"
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
        package_count: Math.max(
          number(current.package_count),
          number(row.package_count)
        ),
        complete_package_count: Math.max(number(current.complete_package_count), number(row.complete_package_count)),
        attempted_package_count: Math.max(number(current.attempted_package_count), number(row.attempted_package_count)),
        canonical_open_package_count: Math.max(number(current.canonical_open_package_count), number(row.canonical_open_package_count)),
        reference_match_available: current.reference_match_available !== false && row.reference_match_available !== false,
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
          (sum, row) => sum + number(row.package_count),
          0
        ),
        complete_packages: expressRows.reduce((sum, row) => sum + number(row.complete_package_count), 0),
        attempted_packages: expressRows.reduce((sum, row) => sum + number(row.attempted_package_count), 0),
        open_packages: expressRows.reduce(
          (sum, row) => sum + number(row.canonical_open_package_count),
          0
        ),
        available: !expressResult.error && expressRows.length > 0 && expressRows.every((row) => row.reference_match_available !== false),
        error: expressResult.error?.message ?? (expressRows.some((row) => row.reference_match_available === false) ? "All Codes status matching is unavailable for part of this period; Express manifest volume remains authoritative." : null),
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
