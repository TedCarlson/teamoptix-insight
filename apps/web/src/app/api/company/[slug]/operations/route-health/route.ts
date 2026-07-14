import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteHealthRow = {
  company_id: string;
  company_slug: string;
  service_date: string;
  capture_plan_id: string;
  capture_plan_route_id: string;
  route_key: string;
  route_label: string | null;

  plan_status: string | null;
  route_status: string | null;
  manifest_normalization_status: string | null;

  artifact_count: number | null;
  delivery_artifact_count: number | null;
  pickup_artifact_count: number | null;
  delivery_artifact_status: string | null;
  pickup_artifact_status: string | null;
  latest_captured_at: string | null;
  latest_processed_at: string | null;

  delivery_stop_count: number | null;
  completed_delivery_stop_count: number | null;
  incomplete_delivery_stop_count: number | null;
  delivery_package_count: number | null;

  express_package_count: number | null;
  express_stop_count: number | null;
  completed_express_package_count: number | null;
  incomplete_express_package_count: number | null;
  residential_express_package_count: number | null;
  signature_express_package_count: number | null;
  hazmat_express_package_count: number | null;
  collection_express_package_count: number | null;

  residential_package_count: number | null;
  signature_package_count: number | null;
  hazmat_package_count: number | null;
  collection_package_count: number | null;

  pickup_stop_count: number | null;
  pickup_expected_package_count: number | null;
  pickup_actual_package_count: number | null;
  earliest_pickup_ready_time: string | null;
  latest_pickup_close_time: string | null;

  route_health_status: string;
  route_health_severity: string;
  route_health_flags: Record<string, unknown> | null;
};

type RouteHealthCard = {
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  capture_plan_route_id: string;
  status: string;
  severity: string;
  flags: Record<string, unknown>;
  artifacts: {
    total: number;
    delivery_count: number;
    pickup_count: number;
    delivery_status: string | null;
    pickup_status: string | null;
    latest_captured_at: string | null;
    latest_processed_at: string | null;
  };
  delivery: {
    stop_count: number;
    completed_stop_count: number;
    incomplete_stop_count: number;
    package_count: number;
  };
  express: {
    package_count: number;
    stop_count: number;
    completed_package_count: number;
    incomplete_package_count: number;
    residential_package_count: number;
    signature_package_count: number;
    hazmat_package_count: number;
    collection_package_count: number;
  };
  pickup: {
    stop_count: number;
    expected_package_count: number;
    actual_package_count: number;
    earliest_ready_time: string | null;
    latest_close_time: string | null;
  };
};

function normalizeDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusCounts(rows: RouteHealthRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = String(row.route_health_status ?? "UNKNOWN").trim() || "UNKNOWN";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function severityCounts(rows: RouteHealthRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = String(row.route_health_severity ?? "UNKNOWN").trim() || "UNKNOWN";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function latest(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function toRouteHealthCard(row: RouteHealthRow): RouteHealthCard {
  return {
    route_key: row.route_key,
    route_label: row.route_label,
    capture_plan_id: row.capture_plan_id,
    capture_plan_route_id: row.capture_plan_route_id,
    status: row.route_health_status,
    severity: row.route_health_severity,
    flags: row.route_health_flags ?? {},
    artifacts: {
      total: n(row.artifact_count),
      delivery_count: n(row.delivery_artifact_count),
      pickup_count: n(row.pickup_artifact_count),
      delivery_status: row.delivery_artifact_status,
      pickup_status: row.pickup_artifact_status,
      latest_captured_at: row.latest_captured_at,
      latest_processed_at: row.latest_processed_at,
    },
    delivery: {
      stop_count: n(row.delivery_stop_count),
      completed_stop_count: n(row.completed_delivery_stop_count),
      incomplete_stop_count: n(row.incomplete_delivery_stop_count),
      package_count: n(row.delivery_package_count),
    },
    express: {
      package_count: n(row.express_package_count),
      stop_count: n(row.express_stop_count),
      completed_package_count: n(row.completed_express_package_count),
      incomplete_package_count: n(row.incomplete_express_package_count),
      residential_package_count: n(row.residential_express_package_count),
      signature_package_count: n(row.signature_express_package_count),
      hazmat_package_count: n(row.hazmat_express_package_count),
      collection_package_count: n(row.collection_express_package_count),
    },
    pickup: {
      stop_count: n(row.pickup_stop_count),
      expected_package_count: n(row.pickup_expected_package_count),
      actual_package_count: n(row.pickup_actual_package_count),
      earliest_ready_time: row.earliest_pickup_ready_time,
      latest_close_time: row.latest_pickup_close_time,
    },
  };
}

function buildTotals(rows: RouteHealthRow[]) {
  return rows.reduce(
    (totals, row) => ({
      route_count: totals.route_count + 1,
      high_severity_route_count:
        totals.high_severity_route_count +
        (row.route_health_severity === "HIGH" ? 1 : 0),
      medium_severity_route_count:
        totals.medium_severity_route_count +
        (row.route_health_severity === "MEDIUM" ? 1 : 0),
      low_severity_route_count:
        totals.low_severity_route_count +
        (row.route_health_severity === "LOW" ? 1 : 0),
      delivery_stop_count:
        totals.delivery_stop_count + n(row.delivery_stop_count),
      incomplete_delivery_stop_count:
        totals.incomplete_delivery_stop_count +
        n(row.incomplete_delivery_stop_count),
      delivery_package_count:
        totals.delivery_package_count + n(row.delivery_package_count),
      express_package_count:
        totals.express_package_count + n(row.express_package_count),
      express_stop_count:
        totals.express_stop_count + n(row.express_stop_count),
      incomplete_express_package_count:
        totals.incomplete_express_package_count +
        n(row.incomplete_express_package_count),
      pickup_stop_count:
        totals.pickup_stop_count + n(row.pickup_stop_count),
      pickup_expected_package_count:
        totals.pickup_expected_package_count +
        n(row.pickup_expected_package_count),
      pickup_actual_package_count:
        totals.pickup_actual_package_count + n(row.pickup_actual_package_count),
    }),
    {
      route_count: 0,
      high_severity_route_count: 0,
      medium_severity_route_count: 0,
      low_severity_route_count: 0,
      delivery_stop_count: 0,
      incomplete_delivery_stop_count: 0,
      delivery_package_count: 0,
      express_package_count: 0,
      express_stop_count: 0,
      incomplete_express_package_count: 0,
      pickup_stop_count: 0,
      pickup_expected_package_count: 0,
      pickup_actual_package_count: 0,
    }
  );
}

function buildFreshness(rows: RouteHealthRow[]) {
  return {
    latest_captured_at: latest(rows.map((row) => row.latest_captured_at)),
    latest_processed_at: latest(rows.map((row) => row.latest_processed_at)),
    status_counts: statusCounts(rows),
    severity_counts: severityCounts(rows),
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const serviceDate = normalizeDate(req.nextUrl.searchParams.get("serviceDate"));

    if (!serviceDate) {
      return NextResponse.json(
        {
          error: "serviceDate is required as YYYY-MM-DD.",
          routes: [],
          totals: null,
        },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        {
          error: "Company not found.",
          routes: [],
          totals: null,
        },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("operations_manifest_route_health_v")
      .select("*")
      .eq("company_id", company.id)
      .eq("service_date", serviceDate)
      .order("route_health_severity", { ascending: true })
      .order("route_key", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          routes: [],
          totals: null,
        },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as RouteHealthRow[];

    return NextResponse.json({
      company_slug: slug,
      service_date: serviceDate,
      routes: rows.map(toRouteHealthCard),
      totals: buildTotals(rows),
      freshness: buildFreshness(rows),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load route health.",
        routes: [],
        totals: null,
      },
      { status: 500 }
    );
  }
}
