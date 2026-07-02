import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type DailySummaryRow = {
  service_date: string;
  route_count: number | string | null;
  normalized_row_json: Record<string, unknown> | null;
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function avg(values: number[]) {
  const clean = values.filter((value) => value > 0);
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function pctDelta(current: number, baseline: number) {
  if (!baseline) return 0;
  return ((current - baseline) / baseline) * 100;
}

function demandSignal(deltaPct: number) {
  const abs = Math.abs(deltaPct);
  if (abs >= 10) return deltaPct > 0 ? "HOT" : "COOL";
  if (abs >= 5) return deltaPct > 0 ? "WARM" : "SOFT";
  return "NORMAL";
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyError } = await sb
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

    const { data, error } = await sb.rpc("get_daily_operations_calendar", {
      p_company_id: company.id,
      p_start_date: "2020-01-01",
      p_end_date: todayIso(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const finalDays = (data ?? [])
      .filter((day: { service_date?: string | null; status?: string | null }) => day.status === "final")
      .map((day: { service_date?: string | null }) => String(day.service_date ?? "").slice(0, 10))
      .filter(Boolean)
      .sort()
      .slice(-15);

    const summaries = await Promise.all(
      finalDays.map(async (date: string) => {
        const { data: summaryData, error: summaryError } = await sb.rpc("get_daily_operations_summary", {
          p_company_id: company.id,
          p_service_date: date,
        });

        if (summaryError) {
          throw new Error(summaryError.message);
        }

        return (summaryData?.[0] ?? null) as DailySummaryRow | null;
      })
    );

    const rows = summaries.filter(Boolean) as DailySummaryRow[];
    const latest = rows.at(-1) ?? null;
    const history = rows.slice(0, -1).slice(-14);

    const latestJson = latest?.normalized_row_json ?? {};
    const latestRoutes = n(latest?.route_count);
    const latestStops = n(latestJson.actual_delivery_stops);
    const latestPackages = n(latestJson.actual_delivery_packages);

    const historyRoutes = history.map((row) => n(row.route_count));
    const historyStops = history.map((row) => n(row.normalized_row_json?.actual_delivery_stops));
    const historyPackages = history.map((row) => n(row.normalized_row_json?.actual_delivery_packages));

    const avgRoutes = avg(historyRoutes);
    const avgStops = avg(historyStops);
    const avgPackages = avg(historyPackages);

    const stopsDeltaPct = pctDelta(latestStops, avgStops);
    const packagesDeltaPct = pctDelta(latestPackages, avgPackages);
    const routesDeltaPct = pctDelta(latestRoutes, avgRoutes);

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      demand: {
        window: "LAST_14_OPERATION_DAYS",
        latest_service_date: latest?.service_date ?? null,
        history_count: history.length,

        latest: {
          routes: latestRoutes,
          stops: latestStops,
          packages: latestPackages,
        },

        average: {
          routes: Number(avgRoutes.toFixed(1)),
          stops: Number(avgStops.toFixed(1)),
          packages: Number(avgPackages.toFixed(1)),
        },

        delta_pct: {
          routes: Number(routesDeltaPct.toFixed(1)),
          stops: Number(stopsDeltaPct.toFixed(1)),
          packages: Number(packagesDeltaPct.toFixed(1)),
        },

        signal: demandSignal((stopsDeltaPct + packagesDeltaPct) / 2),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load operations intelligence summary.",
      },
      { status: 500 }
    );
  }
}
