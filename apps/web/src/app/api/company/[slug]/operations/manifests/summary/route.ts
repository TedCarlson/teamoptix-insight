import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ManifestRouteSummaryRow = {
  company_id: string;
  company_slug: string;
  service_date: string;
  capture_plan_id: string;
  capture_plan_route_id: string;
  route_key: string;
  route_label: string | null;
  plan_status: string;
  route_status: string;
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
  residential_package_count: number | null;
  signature_package_count: number | null;
  hazmat_package_count: number | null;
  collection_package_count: number | null;
  pickup_stop_count: number | null;
  pickup_expected_package_count: number | null;
  pickup_actual_package_count: number | null;
  earliest_pickup_ready_time: string | null;
  latest_pickup_close_time: string | null;
  manifest_normalization_status: string;
};

function normalizeDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function toCount(value: number | null | undefined) {
  return Number(value ?? 0);
}

function buildTotals(rows: ManifestRouteSummaryRow[]) {
  return rows.reduce(
    (totals, row) => ({
      route_count: totals.route_count + 1,
      artifact_count: totals.artifact_count + toCount(row.artifact_count),
      delivery_artifact_count:
        totals.delivery_artifact_count + toCount(row.delivery_artifact_count),
      pickup_artifact_count:
        totals.pickup_artifact_count + toCount(row.pickup_artifact_count),
      delivery_stop_count:
        totals.delivery_stop_count + toCount(row.delivery_stop_count),
      completed_delivery_stop_count:
        totals.completed_delivery_stop_count +
        toCount(row.completed_delivery_stop_count),
      incomplete_delivery_stop_count:
        totals.incomplete_delivery_stop_count +
        toCount(row.incomplete_delivery_stop_count),
      delivery_package_count:
        totals.delivery_package_count + toCount(row.delivery_package_count),
      express_package_count:
        totals.express_package_count + toCount(row.express_package_count),
      residential_package_count:
        totals.residential_package_count + toCount(row.residential_package_count),
      signature_package_count:
        totals.signature_package_count + toCount(row.signature_package_count),
      hazmat_package_count:
        totals.hazmat_package_count + toCount(row.hazmat_package_count),
      collection_package_count:
        totals.collection_package_count + toCount(row.collection_package_count),
      pickup_stop_count: totals.pickup_stop_count + toCount(row.pickup_stop_count),
      pickup_expected_package_count:
        totals.pickup_expected_package_count +
        toCount(row.pickup_expected_package_count),
      pickup_actual_package_count:
        totals.pickup_actual_package_count + toCount(row.pickup_actual_package_count),
    }),
    {
      route_count: 0,
      artifact_count: 0,
      delivery_artifact_count: 0,
      pickup_artifact_count: 0,
      delivery_stop_count: 0,
      completed_delivery_stop_count: 0,
      incomplete_delivery_stop_count: 0,
      delivery_package_count: 0,
      express_package_count: 0,
      residential_package_count: 0,
      signature_package_count: 0,
      hazmat_package_count: 0,
      collection_package_count: 0,
      pickup_stop_count: 0,
      pickup_expected_package_count: 0,
      pickup_actual_package_count: 0,
    }
  );
}

function buildFreshness(rows: ManifestRouteSummaryRow[]) {
  const latestCapturedAt = rows
    .map((row) => row.latest_captured_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const latestProcessedAt = rows
    .map((row) => row.latest_processed_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const statuses = rows.reduce<Record<string, number>>((counts, row) => {
    const status = row.manifest_normalization_status || "UNKNOWN";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    latest_captured_at: latestCapturedAt ?? null,
    latest_processed_at: latestProcessedAt ?? null,
    normalization_status_counts: statuses,
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
        { error: "serviceDate is required as YYYY-MM-DD.", rows: [], totals: null },
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
          rows: [],
          totals: null,
        },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("operations_manifest_route_summary_v")
      .select("*")
      .eq("company_id", company.id)
      .eq("service_date", serviceDate)
      .order("route_key", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [], totals: null },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as ManifestRouteSummaryRow[];

    return NextResponse.json({
      company_slug: slug,
      service_date: serviceDate,
      rows,
      totals: buildTotals(rows),
      freshness: buildFreshness(rows),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load manifest summary.",
        rows: [],
        totals: null,
      },
      { status: 500 }
    );
  }
}
