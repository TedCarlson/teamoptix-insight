import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  isActiveStatus,
  isDriverType,
} from "@/features/payroll/lib/payroll.classification";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type DailySummaryRow = {
  service_date: string;
  route_count: number | string | null;
  normalized_row_json: Record<string, unknown> | null;
};

function todayNyIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values: number[]) {
  const clean = values.filter((value) => value > 0);

  if (clean.length === 0) return 0;

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function percentDelta(current: number, baseline: number) {
  if (!baseline) return 0;
  return ((current - baseline) / baseline) * 100;
}

function demandSignal(deltaPercent: number) {
  const absoluteDelta = Math.abs(deltaPercent);

  if (absoluteDelta >= 10) {
    return deltaPercent > 0 ? "HOT" : "COOL";
  }

  if (absoluteDelta >= 5) {
    return deltaPercent > 0 ? "WARM" : "SOFT";
  }

  return "NORMAL";
}

export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const today = todayNyIso();

    const { data: company, error: companyError } = await supabase
      .from("companies_with_industry")
      .select(
        "id, company_name, company_slug, company_status, industry_label, created_at"
      )
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    const [
      rosterResult,
      accessResult,
      contractResult,
      calendarResult,
    ] = await Promise.all([
      supabase
        .from("company_roster_view")
        .select("worker_type, employment_status")
        .eq("company_id", company.id),

      supabase.rpc("get_company_access_config", {
        p_company_slug: slug,
      }),

      supabase
        .from("company_contract_config")
        .select(
          "contract_number, terminal_identity, service_area, status, effective_start_date, effective_end_date"
        )
        .eq("company_id", company.id)
        .order("effective_start_date", { ascending: false }),

      supabase.rpc("get_daily_operations_calendar", {
        p_company_id: company.id,
        p_start_date: "2020-01-01",
        p_end_date: today,
      }),
    ]);

    if (rosterResult.error) {
      return NextResponse.json(
        { error: rosterResult.error.message },
        { status: 500 }
      );
    }

    if (accessResult.error) {
      return NextResponse.json(
        { error: accessResult.error.message },
        { status: 500 }
      );
    }

    if (contractResult.error) {
      return NextResponse.json(
        { error: contractResult.error.message },
        { status: 500 }
      );
    }

    if (calendarResult.error) {
      return NextResponse.json(
        { error: calendarResult.error.message },
        { status: 500 }
      );
    }

    const activeDrivers = (rosterResult.data ?? []).filter(
      (row) =>
        isDriverType(row.worker_type) &&
        isActiveStatus(row.employment_status)
    ).length;

    const accessPeople = Array.isArray(accessResult.data?.people)
      ? accessResult.data.people
      : [];

    const companyUsers = accessPeople.filter(
      (person: {
        is_platform_owner?: boolean;
        membership_status?: string | null;
      }) =>
        !person.is_platform_owner &&
        String(person.membership_status ?? "").toLowerCase() === "active"
    ).length;

    const activeContract =
      (contractResult.data ?? []).find((row) => {
        const status = String(row.status ?? "").toLowerCase();
        const start = String(row.effective_start_date ?? "");
        const end = String(row.effective_end_date ?? "");

        return (
          status === "active" &&
          (!start || start <= today) &&
          (!end || end >= today)
        );
      }) ?? null;

    const latestLoadedServiceDate = (calendarResult.data ?? [])
      .filter(
        (day: {
          has_final?: boolean | null;
          has_in_day?: boolean | null;
        }) => Boolean(day.has_final || day.has_in_day)
      )
      .map((day: { service_date?: string | null }) =>
        String(day.service_date ?? "").slice(0, 10)
      )
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    const finalDates = (calendarResult.data ?? [])
      .filter(
        (day: {
          service_date?: string | null;
          status?: string | null;
        }) => day.status === "final"
      )
      .map((day: { service_date?: string | null }) =>
        String(day.service_date ?? "").slice(0, 10)
      )
      .filter(Boolean)
      .sort()
      .slice(-15);

    const summaries = await Promise.all(
      finalDates.map(async (serviceDate: string) => {
        const { data, error } = await supabase.rpc(
          "get_daily_operations_summary",
          {
            p_company_id: company.id,
            p_service_date: serviceDate,
          }
        );

        if (error) {
          throw new Error(error.message);
        }

        return (data?.[0] ?? null) as DailySummaryRow | null;
      })
    );

    const summaryRows = summaries.filter(
      (row): row is DailySummaryRow => Boolean(row)
    );

    const latest = summaryRows.at(-1) ?? null;
    const history = summaryRows.slice(0, -1).slice(-14);

    const latestJson = latest?.normalized_row_json ?? {};

    const latestRoutes = numberValue(latest?.route_count);
    const latestStops = numberValue(
      latestJson.actual_delivery_stops
    );
    const latestPackages = numberValue(
      latestJson.actual_delivery_packages
    );

    const averageRoutes = average(
      history.map((row) => numberValue(row.route_count))
    );
    const averageStops = average(
      history.map((row) =>
        numberValue(row.normalized_row_json?.actual_delivery_stops)
      )
    );
    const averagePackages = average(
      history.map((row) =>
        numberValue(row.normalized_row_json?.actual_delivery_packages)
      )
    );

    const routesDeltaPercent = percentDelta(
      latestRoutes,
      averageRoutes
    );
    const stopsDeltaPercent = percentDelta(
      latestStops,
      averageStops
    );
    const packagesDeltaPercent = percentDelta(
      latestPackages,
      averagePackages
    );

    const combinedDemandDelta =
      (stopsDeltaPercent + packagesDeltaPercent) / 2;

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),

        profile: {
          company_name: company.company_name,
          company_slug: company.company_slug,
          company_status: company.company_status,
          industry_label: company.industry_label,
          created_at: company.created_at,
        },

        operating_profile: {
          average_daily_routes: Number(averageRoutes.toFixed(1)),
          active_driver_count: activeDrivers,
          company_user_count: companyUsers,
          primary_terminal:
            activeContract?.terminal_identity ?? null,
          active_contract_number:
            activeContract?.contract_number ?? null,
          service_area: activeContract?.service_area ?? null,
          last_report: latestLoadedServiceDate
            ? {
                family: "DSW",
                service_date: latestLoadedServiceDate,
              }
            : null,
        },

        analytics: {
          window: "LAST_14_OPERATION_DAYS",
          history_count: history.length,
          latest_service_date: latest?.service_date ?? null,

          latest: {
            routes: latestRoutes,
            stops: latestStops,
            packages: latestPackages,
          },

          average: {
            routes: Number(averageRoutes.toFixed(1)),
            stops: Number(averageStops.toFixed(1)),
            packages: Number(averagePackages.toFixed(1)),
          },

          delta_pct: {
            routes: Number(routesDeltaPercent.toFixed(1)),
            stops: Number(stopsDeltaPercent.toFixed(1)),
            packages: Number(packagesDeltaPercent.toFixed(1)),
          },

          signal: demandSignal(combinedDemandDelta),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load company overview.",
      },
      { status: 500 }
    );
  }
}
