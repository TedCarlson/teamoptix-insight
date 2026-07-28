import { NextRequest, NextResponse } from "next/server";
import {
  annotateManifestPackageEvidence,
  markPackageEvidenceUnavailable,
  packageEvidenceConfigurationAvailable,
  type CurrentPackageStatusEvidence,
  type EvidenceAnnotatedPackage,
} from "@/features/operations/reports/dsw/packageStatus/packageStatus.evidence";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExpressReportRow = EvidenceAnnotatedPackage & {
  company_id: string;
  company_slug: string;
  service_date: string;
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  capture_plan_route_id: string | null;
  source_artifact_id: string | null;
  st_number: string | null;
  sid: string | null;
  tracking_id: string | null;
  prem_svc_raw: string | null;
  recipient: string | null;
  contact_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string | null;
  geocode_precision: string | null;
  completed: string | null;
  delivery_time_begin: string | null;
  delivery_time_end: string | null;
  stop_instructions: string | null;
  is_residential: boolean | null;
  is_signature: boolean | null;
  is_hazmat: boolean | null;
  is_collection: boolean | null;
  artifact_status: string | null;
  captured_at: string | null;
  processed_at: string | null;
  created_at: string | null;
};

type RouteSummary = {
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  capture_plan_route_id: string | null;
  express_package_count: number;
  express_stop_count: number;
  completed_express_package_count: number;
  incomplete_express_package_count: number;
  coded_attempt_express_package_count: number;
  open_uncoded_express_package_count: number;
  residential_express_package_count: number;
  signature_express_package_count: number;
  hazmat_express_package_count: number;
  collection_express_package_count: number;
  artifact_statuses: Record<string, number>;
  latest_captured_at: string | null;
  latest_processed_at: string | null;
};

type ExpressMapStop = {
  stop_key: string;
  route_key: string;
  route_label: string | null;
  sid: string | null;
  st_number: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string | null;
  package_count: number;
  open_count: number;
  coded_attempt_count: number;
  complete_count: number;
  delivery_time_begin: string | null;
  delivery_time_end: string | null;
};

function normalizeDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function currentOperatingDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function stopKey(row: ExpressReportRow) {
  return `${row.st_number ?? ""}|${row.sid ?? ""}`;
}

function isCompleted(row: ExpressReportRow) {
  return String(row.completed ?? "").trim().toUpperCase() === "Y";
}

function isCodedAttempt(row: ExpressReportRow) {
  return row.delivery_evidence_state === "CODED_ATTEMPT";
}

function isOpenUncoded(row: ExpressReportRow) {
  return row.delivery_evidence_state === "OPEN";
}

function normalizedPart(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function addressKey(row: ExpressReportRow) {
  return [
    normalizedPart(row.address_line_1),
    normalizedPart(row.address_line_2),
    normalizedPart(row.city),
    normalizedPart(row.state),
    normalizedPart(row.postal_code),
  ]
    .filter(Boolean)
    .join("|");
}

function stopMapKey(row: ExpressReportRow) {
  return [
    normalizedPart(row.route_key),
    normalizedPart(row.sid),
    normalizedPart(row.st_number),
    addressKey(row),
  ]
    .filter(Boolean)
    .join("::");
}

function earliest(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(0) ?? null;
}

function buildMapStops(rows: ExpressReportRow[]) {
  const grouped = new Map<string, ExpressReportRow[]>();

  for (const row of rows) {
    const key = stopMapKey(row) || `${row.route_key}|${row.sid ?? ""}|${row.st_number ?? ""}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries()).map<ExpressMapStop>(([key, stopRows]) => {
    const first = stopRows[0];
    const completeCount = stopRows.filter(isCompleted).length;

    return {
      stop_key: key,
      route_key: first.route_key,
      route_label: first.route_label,
      sid: first.sid,
      st_number: first.st_number,
      address_line_1: first.address_line_1,
      address_line_2: first.address_line_2,
      city: first.city,
      state: first.state,
      postal_code: first.postal_code,
      latitude: first.latitude,
      longitude: first.longitude,
      geocode_status: first.geocode_status ?? "PENDING",
      package_count: stopRows.length,
      open_count: stopRows.length - completeCount,
      coded_attempt_count: stopRows.filter(isCodedAttempt).length,
      complete_count: completeCount,
      delivery_time_begin: earliest(stopRows.map((row) => row.delivery_time_begin)),
      delivery_time_end: latest(stopRows.map((row) => row.delivery_time_end)),
    };
  });
}

function latest(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function incrementStatus(counts: Record<string, number>, status: string | null) {
  const key = String(status ?? "UNKNOWN").trim() || "UNKNOWN";
  counts[key] = (counts[key] ?? 0) + 1;
}

function buildRouteSummaries(rows: ExpressReportRow[]) {
  const grouped = new Map<string, { rows: ExpressReportRow[]; stopKeys: Set<string> }>();

  for (const row of rows) {
    const key = `${row.capture_plan_id}|${row.route_key}`;
    const existing = grouped.get(key) ?? { rows: [], stopKeys: new Set<string>() };
    existing.rows.push(row);
    existing.stopKeys.add(stopKey(row));
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map<RouteSummary>(({ rows: routeRows, stopKeys }) => {
    const first = routeRows[0];
    const artifactStatuses: Record<string, number> = {};

    for (const row of routeRows) {
      incrementStatus(artifactStatuses, row.artifact_status);
    }

    return {
      route_key: first.route_key,
      route_label: first.route_label,
      capture_plan_id: first.capture_plan_id,
      capture_plan_route_id: first.capture_plan_route_id,
      express_package_count: routeRows.length,
      express_stop_count: stopKeys.size,
      completed_express_package_count: routeRows.filter(isCompleted).length,
      incomplete_express_package_count: routeRows.filter((row) => !isCompleted(row)).length,
      coded_attempt_express_package_count:
        routeRows.filter(isCodedAttempt).length,
      open_uncoded_express_package_count:
        routeRows.filter(isOpenUncoded).length,
      residential_express_package_count: routeRows.filter((row) => row.is_residential).length,
      signature_express_package_count: routeRows.filter((row) => row.is_signature).length,
      hazmat_express_package_count: routeRows.filter((row) => row.is_hazmat).length,
      collection_express_package_count: routeRows.filter((row) => row.is_collection).length,
      artifact_statuses: artifactStatuses,
      latest_captured_at: latest(routeRows.map((row) => row.captured_at)),
      latest_processed_at: latest(routeRows.map((row) => row.processed_at)),
    };
  });
}

function buildTotals(routeSummaries: RouteSummary[]) {
  return routeSummaries.reduce(
    (totals, route) => ({
      route_count: totals.route_count + 1,
      express_package_count:
        totals.express_package_count + route.express_package_count,
      express_stop_count: totals.express_stop_count + route.express_stop_count,
      completed_express_package_count:
        totals.completed_express_package_count +
        route.completed_express_package_count,
      incomplete_express_package_count:
        totals.incomplete_express_package_count +
        route.incomplete_express_package_count,
      coded_attempt_express_package_count:
        totals.coded_attempt_express_package_count +
        route.coded_attempt_express_package_count,
      open_uncoded_express_package_count:
        totals.open_uncoded_express_package_count +
        route.open_uncoded_express_package_count,
      residential_express_package_count:
        totals.residential_express_package_count +
        route.residential_express_package_count,
      signature_express_package_count:
        totals.signature_express_package_count +
        route.signature_express_package_count,
      hazmat_express_package_count:
        totals.hazmat_express_package_count + route.hazmat_express_package_count,
      collection_express_package_count:
        totals.collection_express_package_count +
        route.collection_express_package_count,
    }),
    {
      route_count: 0,
      express_package_count: 0,
      express_stop_count: 0,
      completed_express_package_count: 0,
      incomplete_express_package_count: 0,
      coded_attempt_express_package_count: 0,
      open_uncoded_express_package_count: 0,
      residential_express_package_count: 0,
      signature_express_package_count: 0,
      hazmat_express_package_count: 0,
      collection_express_package_count: 0,
    }
  );
}

function buildFreshness(rows: ExpressReportRow[]) {
  const artifactStatuses = rows.reduce<Record<string, number>>((counts, row) => {
    incrementStatus(counts, row.artifact_status);
    return counts;
  }, {});

  return {
    latest_captured_at: latest(rows.map((row) => row.captured_at)),
    latest_processed_at: latest(rows.map((row) => row.processed_at)),
    artifact_statuses: artifactStatuses,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const requestedServiceDate = normalizeDate(
      req.nextUrl.searchParams.get("serviceDate")
    );
    const serviceDate = currentOperatingDate();

    const supabase = await getSupabaseServerClient();
    const serviceRole = createSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from("operations_manifest_express_report_v")
      .select("*")
      .eq("company_slug", slug)
      .eq("service_date", serviceDate)
      .order("route_key", { ascending: true })
      .order("st_number", { ascending: true })
      .order("tracking_id", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          packages: [],
          route_summaries: [],
          totals: null,
        },
        { status: 500 }
      );
    }

    const manifestRows = (data ?? []) as Array<Record<string, unknown>>;
    const companyId = String(manifestRows[0]?.company_id ?? "").trim();
    const packageStatusResult = companyId
      ? await serviceRole
          .from("operations_dsw_package_status_current_v")
          .select(
            "tracking_ref,work_area_name,work_area_number,vision_label,vision_label_at_local,vsa_status_code,star_status_code,star_scan_at_local,snapshot_generated_at"
          )
          .eq("company_id", companyId)
          .eq("service_date", serviceDate)
      : { data: [], error: null };

    if (packageStatusResult.error) {
      return NextResponse.json(
        {
          error: packageStatusResult.error.message,
          packages: [],
          route_summaries: [],
          totals: null,
        },
        { status: 500 }
      );
    }

    const rows = (
      packageEvidenceConfigurationAvailable()
        ? annotateManifestPackageEvidence({
            companyId,
            packages: manifestRows,
            currentStatusRows:
              (packageStatusResult.data ??
                []) as CurrentPackageStatusEvidence[],
          })
        : markPackageEvidenceUnavailable(manifestRows)
    ) as ExpressReportRow[];
    const routeSummaries = buildRouteSummaries(rows);

    return NextResponse.json({
      company_slug: slug,
      service_date: serviceDate,
      requested_service_date: requestedServiceDate,
      route_summaries: routeSummaries,
      totals: buildTotals(routeSummaries),
      freshness: buildFreshness(rows),
      map_stops: buildMapStops(rows),
      packages: rows.map((row) => ({
        route_key: row.route_key,
        route_label: row.route_label,
        capture_plan_id: row.capture_plan_id,
        capture_plan_route_id: row.capture_plan_route_id,
        source_artifact_id: row.source_artifact_id,
        st_number: row.st_number,
        sid: row.sid,
        tracking_id: row.tracking_id,
        prem_svc_raw: row.prem_svc_raw,
        completed: row.completed,
        delivery_evidence_state: row.delivery_evidence_state,
        delivery_evidence_basis: row.delivery_evidence_basis,
        status_code_source: row.status_code_source,
        vsa_status_code: row.vsa_status_code,
        star_status_code: row.star_status_code,
        status_code_at_local: row.status_code_at_local,
        evidence_snapshot_generated_at: row.evidence_snapshot_generated_at,
        delivery_time_begin: row.delivery_time_begin,
        delivery_time_end: row.delivery_time_end,
        recipient: row.recipient,
        contact_name: row.contact_name,
        address_line_1: row.address_line_1,
        address_line_2: row.address_line_2,
        city: row.city,
        state: row.state,
        postal_code: row.postal_code,
        latitude: row.latitude,
        longitude: row.longitude,
        geocode_status: row.geocode_status,
        geocode_precision: row.geocode_precision,
        stop_instructions: row.stop_instructions,
        is_residential: row.is_residential,
        is_signature: row.is_signature,
        is_hazmat: row.is_hazmat,
        is_collection: row.is_collection,
        artifact_status: row.artifact_status,
        captured_at: row.captured_at,
        processed_at: row.processed_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load express report.",
        packages: [],
        route_summaries: [],
        totals: null,
      },
      { status: 500 }
    );
  }
}
