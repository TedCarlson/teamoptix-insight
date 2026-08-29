import { NextRequest, NextResponse } from "next/server";
import {
  annotateManifestPackageEvidence,
  markPackageEvidenceUnavailable,
  packageEvidenceAvailableForPackages,
  type CurrentPackageStatusEvidence,
} from "@/features/operations/reports/dsw/packageStatus/packageStatus.evidence";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadExpressEvidence } from "@/features/operations/express/loadExpressEvidence";
import {
  getAutomationCredential,
  getOrCreateFedExAutomationProfile,
} from "@/features/automation/server/automation.repository";
import {
  applyManifestIdentityAccess,
  resolveManifestIdentityAccess,
} from "@/features/operations/manifests/manifestIdentityAccess";
import type { RouteGpxGeometry } from "@/features/operations/manifests/routeGpx";
import { presentRouteGpx } from "@/features/operations/manifests/routeGpxPresentation";
import {
  buildManifestCollectionPace,
  manifestCollectionPaceFromDayFact,
} from "@/features/operations/manifests/manifestCollectionPace";

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
  attempted_express_package_count?: number | null;
  open_express_package_count?: number | null;
  tracking_identity_missing_count?: number | null;
  stop_link_missing_count?: number | null;
  stop_link_ambiguous_count?: number | null;
  reference_match_available?: boolean;
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
    complete_package_count: number;
    attempted_package_count: number;
    open_package_count: number;
    data_health: {
      tracking_identity_missing_count: number;
      stop_link_missing_count: number;
      stop_link_ambiguous_count: number;
      reference_match_available: boolean;
    };
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

type DurablePackageFact = {
  stop_number: string | null;
  postal_code_5: string | null;
  tracking_ref: string;
  tracking_ref_version: string;
  service_code: string | null;
  execution_status: "OPEN" | "CLOSED" | "UNKNOWN";
  is_express: boolean;
  is_residential: boolean;
  is_signature: boolean;
  is_hazmat: boolean;
  is_collection: boolean;
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

function normalizedManifestKey(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function manifestAddressKey(row: Record<string, unknown>) {
  return [
    row.address_line_1,
    row.address_line_2,
    row.city,
    row.state,
    row.postal_code,
  ]
    .map(normalizedManifestKey)
    .filter(Boolean)
    .join("|");
}

function packagesWithManifestCompletion(params: {
  packages: Array<Record<string, unknown>>;
  stops: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  return params.packages.map((packageRow) => {
    const sid = normalizedManifestKey(packageRow.sid);
    const stopNumber = normalizedManifestKey(packageRow.st_number);
    const address = manifestAddressKey(packageRow);
    const candidateGroups = [
      sid
        ? params.stops.filter(
            (stop) => normalizedManifestKey(stop.sid) === sid
          )
        : [],
      stopNumber && stopNumber !== "0"
        ? params.stops.filter(
            (stop) => normalizedManifestKey(stop.st_number) === stopNumber
          )
        : [],
      address
        ? params.stops.filter((stop) => manifestAddressKey(stop) === address)
        : [],
    ];
    const bestCandidates = candidateGroups.find((group) => group.length > 0) ?? [];
    const linkedStop = bestCandidates.length === 1 ? bestCandidates[0] : null;
    return {
      ...packageRow,
      manifest_completed: linkedStop?.completed ?? null,
      manifest_stop_link_status:
        bestCandidates.length === 1
          ? "LINKED"
          : bestCandidates.length > 1
            ? "AMBIGUOUS"
            : "MISSING",
    };
  });
}

function durableTrackingAlias(trackingRef: string) {
  const digest = trackingRef.split("_").at(-1) ?? trackingRef;
  return `PKG-${digest.slice(-12).toUpperCase()}`;
}

function presentDurableManifestFacts(facts: DurablePackageFact[]) {
  const packages = facts.map<Record<string, unknown>>((fact, index) => {
    const stopNumber = fact.stop_number || String(index + 1);
    return {
      st_number: stopNumber,
      sid: `DEIDENTIFIED-${stopNumber}`,
      tracking_id: durableTrackingAlias(fact.tracking_ref),
      tracking_ref: fact.tracking_ref,
      tracking_ref_version: fact.tracking_ref_version,
      postal_code: fact.postal_code_5,
      prem_svc_raw: fact.service_code,
      manifest_completed: fact.execution_status === "CLOSED" ? "Y" : "N",
      manifest_stop_link_status: "LINKED",
      is_express: fact.is_express,
      is_residential: fact.is_residential,
      is_signature: fact.is_signature,
      is_hazmat: fact.is_hazmat,
      is_collection: fact.is_collection,
    };
  });
  const byStop = facts.reduce<Map<string, DurablePackageFact[]>>((groups, fact, index) => {
    const stopNumber = fact.stop_number || String(index + 1);
    groups.set(stopNumber, [...(groups.get(stopNumber) ?? []), fact]);
    return groups;
  }, new Map());
  const stops = Array.from(byStop, ([stopNumber, stopFacts]) => ({
    st_number: stopNumber,
    sid: `DEIDENTIFIED-${stopNumber}`,
    postal_code: stopFacts.find((fact) => fact.postal_code_5)?.postal_code_5 ?? null,
    package_count: stopFacts.length,
    completed: stopFacts.every((fact) => fact.execution_status === "CLOSED") ? "Y" : "N",
  }));

  return { packages, stops };
}

function removeInternalTrackingReference(row: Record<string, unknown>) {
  const presented = { ...row };
  delete presented.tracking_ref;
  delete presented.tracking_ref_version;
  return presented;
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
      complete_package_count: n(row.completed_express_package_count),
      attempted_package_count: n(row.attempted_express_package_count),
      open_package_count: n(row.open_express_package_count),
      data_health: {
        tracking_identity_missing_count: n(row.tracking_identity_missing_count),
        stop_link_missing_count: n(row.stop_link_missing_count),
        stop_link_ambiguous_count: n(row.stop_link_ambiguous_count),
        reference_match_available: row.reference_match_available !== false,
      },
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
      complete_express_package_count:
        totals.complete_express_package_count +
        n(row.completed_express_package_count),
      attempted_express_package_count:
        totals.attempted_express_package_count +
        n(row.attempted_express_package_count),
      open_express_package_count:
        totals.open_express_package_count + n(row.open_express_package_count),
      tracking_identity_missing_count:
        totals.tracking_identity_missing_count +
        n(row.tracking_identity_missing_count),
      stop_link_missing_count:
        totals.stop_link_missing_count + n(row.stop_link_missing_count),
      stop_link_ambiguous_count:
        totals.stop_link_ambiguous_count + n(row.stop_link_ambiguous_count),
      reference_match_available:
        totals.reference_match_available && row.reference_match_available !== false,
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
      complete_express_package_count: 0,
      attempted_express_package_count: 0,
      open_express_package_count: 0,
      tracking_identity_missing_count: 0,
      stop_link_missing_count: 0,
      stop_link_ambiguous_count: 0,
      reference_match_available: true,
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

function canonicalRouteRows(rows: RouteHealthRow[]) {
  const byRoute = new Map<string, RouteHealthRow>();

  function activityScore(row: RouteHealthRow) {
    return (
      n(row.artifact_count) * 1_000_000 +
      n(row.delivery_package_count) * 10_000 +
      n(row.delivery_stop_count) * 1_000 +
      n(row.pickup_stop_count) * 100 +
      n(row.express_package_count)
    );
  }

  rows.forEach((row) => {
    const key = String(row.route_key ?? "").trim();
    const current = byRoute.get(key);
    if (!current) {
      byRoute.set(key, row);
      return;
    }

    const rowScore = activityScore(row);
    const currentScore = activityScore(current);
    const rowFreshness = row.latest_processed_at ?? row.latest_captured_at ?? "";
    const currentFreshness =
      current.latest_processed_at ?? current.latest_captured_at ?? "";

    if (
      rowScore > currentScore ||
      (rowScore === currentScore && rowFreshness > currentFreshness)
    ) {
      byRoute.set(key, row);
    }
  });

  return Array.from(byRoute.values());
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
    const serviceRole = createSupabaseServiceRoleClient();

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

    const routeKey = String(req.nextUrl.searchParams.get("routeKey") ?? "").trim();

    if (routeKey) {
      const profileResult = await getOrCreateFedExAutomationProfile(
        supabase,
        company.id
      );
      const credentialResult = profileResult.profile
        ? await getAutomationCredential(supabase, profileResult.profile.id)
        : { row: null, error: profileResult.error };
      const identityAccess = resolveManifestIdentityAccess({
        profileStatus: profileResult.profile?.status ?? null,
        hasSecret: credentialResult.row?.has_secret ?? false,
        lastVerifiedAt: credentialResult.row?.last_verified_at ?? null,
        lastVerificationResult:
          credentialResult.row?.last_verification_result ?? null,
      });
      const [
        deliveryStopsResult,
        packagesResult,
        pickupsResult,
        clustersResult,
        routeGpxResult,
        packageStatusResult,
        expressReferenceResult,
        manifestCollectionResult,
        durablePackageResult,
        durableManifestDayResult,
      ] = await Promise.all([
          supabase
            .from("operations_delivery_manifest_stop_v")
            .select("*")
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("route_key", routeKey)
            .order("st_number", { ascending: true }),
          supabase
            .from("operations_delivery_manifest_package_v")
            .select("*")
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("route_key", routeKey)
            .order("st_number", { ascending: true })
            .order("tracking_id", { ascending: true }),
          supabase
            .from("operations_pickup_manifest_stop_v")
            .select("*")
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("route_key", routeKey)
            .order("ready_at", { ascending: true }),
          supabase.rpc("get_operations_manifest_stop_clusters", {
            p_company_id: company.id,
            p_service_date: serviceDate,
            p_route_key: routeKey,
          }),
          serviceRole.rpc("get_operations_route_gpx_geometry", {
            p_company_id: company.id,
            p_service_date: serviceDate,
            p_route_key: routeKey,
          }),
          serviceRole
            .from("operations_dsw_package_status_current_v")
            .select(
              "tracking_ref,work_area_name,work_area_number,vision_label,vision_label_at_local,vsa_status_code,star_status_code,star_scan_at_local,snapshot_generated_at"
            )
            .eq("company_id", company.id)
            .eq("service_date", serviceDate),
          supabase
            .from("operations_manifest_express_report_v")
            .select("tracking_id,tracking_ref,manifest_stop_linked")
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("route_key", routeKey),
          serviceRole
            .from("operations_collection_artifact_v")
            .select(
              "created_at,ingest_completed_at,runner_artifact_json,ingest_metadata_json"
            )
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("artifact_status", "INGESTED")
            .contains("runner_artifact_json", {
              route_key: routeKey,
              artifact_key: "DELIVERY_MANIFEST",
            })
            .order("created_at", { ascending: true })
            .limit(200),
          serviceRole
            .from("operations_route_package_fact_v")
            .select(
              "stop_number,postal_code_5,tracking_ref,tracking_ref_version,service_code,execution_status,is_express,is_residential,is_signature,is_hazmat,is_collection"
            )
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("route_key", routeKey)
            .order("stop_number", { ascending: true }),
          serviceRole
            .from("operations_route_manifest_day_fact_v")
            .select("pace_summary_json")
            .eq("company_id", company.id)
            .eq("service_date", serviceDate)
            .eq("route_key", routeKey)
            .maybeSingle(),
        ]);

      const detailError =
        deliveryStopsResult.error ??
        packagesResult.error ??
        pickupsResult.error ??
        clustersResult.error ??
        packageStatusResult.error ??
        expressReferenceResult.error;

      if (manifestCollectionResult.error) {
        console.error("Route manifest collection pace unavailable.", {
          companyId: company.id,
          serviceDate,
          routeKey,
          error: manifestCollectionResult.error.message,
        });
      }
      if (durablePackageResult.error) {
        console.error("Durable route package facts unavailable.", {
          companyId: company.id,
          serviceDate,
          routeKey,
          error: durablePackageResult.error.message,
        });
      }
      if (durableManifestDayResult.error) {
        console.error("Durable route manifest day facts unavailable.", {
          companyId: company.id,
          serviceDate,
          routeKey,
          error: durableManifestDayResult.error.message,
        });
      }

      if (detailError) {
        return NextResponse.json({ error: detailError.message }, { status: 500 });
      }

      const referenceByTrackingId = new Map(
        (expressReferenceResult.data ?? []).map((row) => [
          String(row.tracking_id ?? "").trim(),
          row,
        ])
      );
      const durableFacts = durablePackageResult.error
        ? []
        : (durablePackageResult.data ?? []) as DurablePackageFact[];
      const useDurableFacts =
        (deliveryStopsResult.data ?? []).length === 0 &&
        (packagesResult.data ?? []).length === 0 &&
        durableFacts.length > 0;
      const durableManifest = presentDurableManifestFacts(durableFacts);
      const sourceDeliveryStops = useDurableFacts
        ? durableManifest.stops
        : (deliveryStopsResult.data ?? []) as Array<Record<string, unknown>>;
      const sourcePackages = useDurableFacts
        ? durableManifest.packages
        : (packagesResult.data ?? []) as Array<Record<string, unknown>>;
      const deliveryStops = sourceDeliveryStops.map((row, index) => ({
        ...row,
        _route_map_ref: useDurableFacts ? undefined : `D:${index}`,
      }));
      const pickups = (
        (pickupsResult.data ?? []) as Array<Record<string, unknown>>
      ).map((row, index) => ({ ...row, _route_map_ref: `P:${index}` }));
      const manifestPackages = packagesWithManifestCompletion({
        packages: sourcePackages,
        stops: deliveryStops,
      }).map((packageRow) => {
        const reference = referenceByTrackingId.get(
          String(packageRow.tracking_id ?? "").trim()
        );
        return reference ? { ...packageRow, ...reference } : packageRow;
      });
      const packages = packageEvidenceAvailableForPackages(manifestPackages)
        ? annotateManifestPackageEvidence({
            companyId: company.id,
            packages: manifestPackages,
            currentStatusRows:
              (packageStatusResult.data ??
                []) as CurrentPackageStatusEvidence[],
          })
        : markPackageEvidenceUnavailable(manifestPackages);
      const routeGpx = presentRouteGpx({
        geometry: (routeGpxResult.error
          ? null
          : routeGpxResult.data ?? null) as RouteGpxGeometry | null,
        deliveryStops,
        packages: packages as Array<Record<string, unknown>>,
        pickups,
      });
      const liveCollectionPace = buildManifestCollectionPace(
        manifestCollectionResult.error
          ? []
          : manifestCollectionResult.data ?? []
      );
      const durableCollectionPace = durableManifestDayResult.error
        ? null
        : manifestCollectionPaceFromDayFact(
            durableManifestDayResult.data?.pace_summary_json
          );

      return NextResponse.json({
        company_slug: slug,
        service_date: serviceDate,
        route_key: routeKey,
        retention_mode: useDurableFacts ? "DEIDENTIFIED" : "IDENTIFIABLE",
        identity_access: identityAccess,
        delivery_stops: deliveryStops.map((row) =>
          applyManifestIdentityAccess(row, identityAccess)
        ),
        packages: packages.map((row) => {
          const accessible = applyManifestIdentityAccess(row, identityAccess);
          return useDurableFacts
            ? removeInternalTrackingReference(accessible)
            : accessible;
        }),
        pickups: pickups.map((row) =>
          applyManifestIdentityAccess(row, identityAccess)
        ),
        stop_clusters: clustersResult.data ?? [],
        route_gpx: routeGpx,
        collection_pace:
          liveCollectionPace.capture_count > 0
            ? liveCollectionPace
            : durableCollectionPace ?? liveCollectionPace,
      });
    }

    const [routeHealthResult, expressEvidence] =
      await Promise.all([
        supabase
          .from("operations_manifest_route_health_v")
          .select("*")
          .eq("company_id", company.id)
          .eq("service_date", serviceDate)
          .order("route_health_severity", { ascending: true })
          .order("route_key", { ascending: true }),
        loadExpressEvidence({
          companyId: company.id,
          serviceDate,
          manifestClient: serviceRole,
          statusClient: serviceRole,
        }),
      ]);

    const summaryError = routeHealthResult.error;
    if (summaryError) {
      return NextResponse.json(
        {
          error: summaryError.message,
          routes: [],
          totals: null,
        },
        { status: 500 }
      );
    }

    const canonicalRows = canonicalRouteRows(
      (routeHealthResult.data ?? []) as RouteHealthRow[]
    );
    const expressByRoute = new Map(
      expressEvidence.routes.map((route) => [route.route_key, route])
    );
    const rows = canonicalRows.map((row) => {
      const signal = expressByRoute.get(String(row.route_key));
      return {
        ...row,
        express_package_count: n(signal?.package_count),
        completed_express_package_count: n(
          signal?.complete_package_count
        ),
        attempted_express_package_count: n(signal?.attempted_package_count),
        open_express_package_count: n(signal?.open_package_count),
        tracking_identity_missing_count: n(
          signal?.tracking_identity_missing_count
        ),
        stop_link_missing_count: n(signal?.stop_link_missing_count),
        stop_link_ambiguous_count: n(signal?.stop_link_ambiguous_count),
        reference_match_available: signal?.reference_match_available !== false,
      };
    });

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
