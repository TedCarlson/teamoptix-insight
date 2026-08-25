import { NextRequest, NextResponse } from "next/server";
import {
  fccRouteIdentity,
  fccSummaryFields,
  isManifestDetailDate,
  manifestHistoryWindow,
  normalizeManifestRouteKey,
  preferFccRouteSummary,
  type FccManifestSummaryRow,
} from "@/features/operations/manifests/manifestHistory";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteSummary = {
  route_key: string;
  route_label: string | null;
  route_status: string;
  manifest_normalization_status: string;
  delivery_stop_count: number | null;
  completed_delivery_stop_count: number | null;
  incomplete_delivery_stop_count: number | null;
  delivery_package_count: number | null;
  delivery_artifact_status: string | null;
  latest_captured_at: string | null;
  latest_processed_at: string | null;
  delivery_artifact_count: number;
};

type StopPackageSummary = {
  count: number;
  express: number;
  signature: number;
  hazmat: number;
  residential: number;
  collection: number;
};

type DeliveryStopDetail = Record<string, unknown> & {
  package_summary: StopPackageSummary;
};

type RouteStopCluster = {
  route_key: string;
  route_label: string;
  cluster_key: string;
  postal_code_5: string | null;
  centroid_latitude: number | null;
  centroid_longitude: number | null;
  stop_count: number;
  delivery_stop_count: number;
  pickup_stop_count: number;
  completed_stop_count: number;
  package_count: number;
  standard_delivery_stop_count: number;
  express_stop_count: number;
  signature_stop_count: number;
  hazmat_stop_count: number;
  residential_stop_count: number;
  collection_stop_count: number;
  first_stop_sequence: number | null;
  last_stop_sequence: number | null;
  suppressed_location_count: number;
  is_location_suppressed: boolean;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function localDeliveryTimestamp(serviceDate: string, time: string | null) {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${serviceDate}T${match[1].padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

function packageStopKey(row: Record<string, unknown>) {
  return [row.st_number, row.sid].map(normalizeManifestRouteKey).join("|");
}

function normalizeAddress(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/[^A-Z0-9]/g, "");
}

function fiveDigitPostalCode(value: unknown) {
  return String(value ?? "").match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
}

function publicRoute<Route extends Record<string, unknown>>(route: Route) {
  return {
    ...route,
    last_delivery_address: null,
    last_delivery_postal_code:
      fiveDigitPostalCode(route.last_delivery_postal_code) ??
      fiveDigitPostalCode(route.last_delivery_address),
  };
}

function publicStop(stop: DeliveryStopDetail) {
  return {
    id: stop.id,
    st_number: stop.st_number,
    sid: stop.sid,
    recipient: null,
    contact_name: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    state: null,
    postal_code: fiveDigitPostalCode(stop.postal_code),
    delivery_time_begin: stop.delivery_time_begin,
    delivery_time_end: stop.delivery_time_end,
    package_count: stop.package_count,
    stop_instructions: null,
    completed: stop.completed,
    package_summary: stop.package_summary,
  };
}

function stopAddress(stop: Record<string, unknown>) {
  return [
    stop.address_line_1,
    stop.address_line_2,
    stop.city,
    stop.state,
    stop.postal_code,
  ]
    .filter(Boolean)
    .join(" ");
}

function stopSequence(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const serviceDate = text(req.nextUrl.searchParams.get("date"));
    const requestedRouteKey = text(req.nextUrl.searchParams.get("routeKey"));
    const window = manifestHistoryWindow();
    const detailAvailable = isManifestDetailDate(serviceDate);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
      serviceDate < window.minimum ||
      serviceDate > window.maximum
    ) {
      return NextResponse.json(
        {
          error: `Choose a service date from ${window.minimum} through ${window.maximum}.`,
          retention: window,
          routes: [],
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
        { error: "Company not found.", retention: window, routes: [] },
        { status: 404 }
      );
    }

    if (!detailAvailable) {
      const [factResult, clusterResult] = await Promise.all([
        supabase
          .from("operations_route_last_delivery_fact_v")
          .select(
            "route_key,route_label,last_delivery_time_local,last_delivery_postal_code,deliveries_complete,transformed_at"
          )
          .eq("company_id", company.id)
          .eq("service_date", serviceDate)
          .order("route_label", { ascending: true })
          .order("route_key", { ascending: true }),
        supabase.rpc("get_operations_manifest_stop_clusters", {
          p_company_id: company.id,
          p_service_date: serviceDate,
          p_route_key: null,
        }),
      ]);

      const historyError = factResult.error ?? clusterResult.error;
      if (historyError) {
        return NextResponse.json(
          { error: historyError.message, retention: window, routes: [] },
          { status: 500 }
        );
      }

      const stopClusters = (clusterResult.data ?? []) as RouteStopCluster[];
      const factsByRoute = new Map(
        (factResult.data ?? []).map((row) => [
          normalizeManifestRouteKey(row.route_key),
          row,
        ])
      );
      const clustersByRoute = new Map<string, RouteStopCluster[]>();
      for (const cluster of stopClusters) {
        const key = normalizeManifestRouteKey(cluster.route_key);
        clustersByRoute.set(key, [
          ...(clustersByRoute.get(key) ?? []),
          cluster,
        ]);
      }

      const routeKeys = new Set([
        ...factsByRoute.keys(),
        ...clustersByRoute.keys(),
      ]);
      const routes = [...routeKeys]
        .map((key) => {
          const row = factsByRoute.get(key);
          const clusters = clustersByRoute.get(key) ?? [];
          const deliveryStops = clusters.reduce(
            (sum, cluster) => sum + cluster.delivery_stop_count,
            0
          );
          const completedStops = clusters.reduce(
            (sum, cluster) => sum + cluster.completed_stop_count,
            0
          );
          const packages = clusters.reduce(
            (sum, cluster) => sum + cluster.package_count,
            0
          );

          return {
            route_key: row?.route_key ?? clusters[0]?.route_key ?? key,
            route_label: row?.route_label ?? clusters[0]?.route_label ?? `WA ${key}`,
            route_status: "DEIDENTIFIED",
            manifest_normalization_status: "EVIDENCE_RETAINED",
            delivery_stop_count: clusters.length ? deliveryStops : null,
            completed_delivery_stop_count: clusters.length ? completedStops : null,
            incomplete_delivery_stop_count: clusters.length
              ? Math.max(deliveryStops - completedStops, 0)
              : null,
            delivery_package_count: clusters.length ? packages : null,
            delivery_artifact_status: null,
            latest_captured_at: null,
            latest_processed_at: null,
            driver_name: null,
            last_delivery_time: row?.last_delivery_time_local ?? null,
            last_delivery_address: null,
            last_delivery_postal_code: row?.last_delivery_postal_code ?? null,
            last_delivery_at_local: localDeliveryTimestamp(
              serviceDate,
              row?.last_delivery_time_local ?? null
            ),
            last_pickup_time: null,
            last_transmission_time: null,
            final_stop_time: null,
            deliveries_complete: row?.deliveries_complete ?? false,
            manifest_available: false,
            route_source: row ? "RETAINED_FACT" : "CLUSTER_FACT",
            transformed_at: row?.transformed_at ?? null,
          };
        })
        .sort((left, right) =>
          String(left.route_label).localeCompare(String(right.route_label), undefined, {
            numeric: true,
          })
        );
      const selectedRoute = requestedRouteKey
        ? routes.find(
            (route) =>
              route.route_key === requestedRouteKey ||
              normalizeManifestRouteKey(route.route_key) ===
                normalizeManifestRouteKey(requestedRouteKey)
          ) ?? null
        : routes[0] ?? null;

      if (requestedRouteKey && !selectedRoute) {
        return NextResponse.json(
          {
            error: "No retained route evidence is available for that route and date.",
            retention: window,
            retention_mode: "DEIDENTIFIED",
            service_date: serviceDate,
            routes,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        retention: window,
        retention_mode: "DEIDENTIFIED",
        service_date: serviceDate,
        routes,
        selected_route: selectedRoute,
        last_delivery_stop: null,
        delivery_stops: [],
        stop_clusters: selectedRoute
          ? clustersByRoute.get(normalizeManifestRouteKey(selectedRoute.route_key)) ?? []
          : [],
      });
    }

    const [summaryResult, fccResult] = await Promise.all([
      supabase
        .from("operations_manifest_route_summary_v")
        .select(
          "route_key,route_label,route_status,manifest_normalization_status,delivery_stop_count,completed_delivery_stop_count,incomplete_delivery_stop_count,delivery_package_count,delivery_artifact_count,delivery_artifact_status,latest_captured_at,latest_processed_at"
        )
        .eq("company_id", company.id)
        .eq("service_date", serviceDate)
        .order("route_label", { ascending: true })
        .order("route_key", { ascending: true }),
      supabase.rpc("get_operations_fcc_current_rows", {
        p_company_id: company.id,
        p_service_date: serviceDate,
      }),
    ]);

    const loadError = summaryResult.error ?? fccResult.error;
    if (loadError) {
      return NextResponse.json(
        { error: loadError.message, retention: window, routes: [] },
        { status: 500 }
      );
    }

    const summaries = (summaryResult.data ?? []) as RouteSummary[];
    const fccRows = (fccResult.data ?? []) as FccManifestSummaryRow[];
    const summariesByRoute = new Map<string, RouteSummary>();
    for (const summary of summaries) {
      const key = normalizeManifestRouteKey(summary.route_key);
      const current = summariesByRoute.get(key);
      if (
        !current ||
        summary.delivery_artifact_count > current.delivery_artifact_count ||
        (summary.manifest_normalization_status === "NORMALIZED" &&
          current.manifest_normalization_status !== "NORMALIZED")
      ) {
        summariesByRoute.set(key, summary);
      }
    }

    const fccByRoute = new Map<string, FccManifestSummaryRow>();
    for (const row of fccRows) {
      const identity = fccRouteIdentity(row);
      if (!identity) continue;
      const current = fccByRoute.get(identity.routeKey);
      if (!current || preferFccRouteSummary(row, current)) {
        fccByRoute.set(identity.routeKey, row);
      }
    }

    const routeKeys = new Set([
      ...fccByRoute.keys(),
      ...summariesByRoute.keys(),
    ]);
    const routes = [...routeKeys]
      .map((key) => {
        const fccRow = fccByRoute.get(key) ?? null;
        const identity = fccRow ? fccRouteIdentity(fccRow) : null;
        const summary = summariesByRoute.get(key) ?? null;
        const fcc = fccSummaryFields(fccRow);
        const manifestAvailable = (summary?.delivery_artifact_count ?? 0) > 0;

        return {
          route_key: summary?.route_key ?? identity?.routeKey ?? key,
          route_label:
            summary?.route_label ?? identity?.routeLabel ?? `WA ${key}`,
          route_status:
            summary?.route_status ??
            (fcc.deliveries_complete ? "COMPLETE" : "IN_PROGRESS"),
          manifest_normalization_status:
            summary?.manifest_normalization_status ?? "NOT_COLLECTED",
          delivery_stop_count: summary?.delivery_stop_count ?? null,
          completed_delivery_stop_count:
            summary?.completed_delivery_stop_count ?? null,
          incomplete_delivery_stop_count:
            summary?.incomplete_delivery_stop_count ?? null,
          delivery_package_count: summary?.delivery_package_count ?? null,
          delivery_artifact_status: summary?.delivery_artifact_status ?? null,
          latest_captured_at: summary?.latest_captured_at ?? null,
          latest_processed_at: summary?.latest_processed_at ?? null,
          manifest_available: manifestAvailable,
          route_source: fccRow ? "FCC" : "MANIFEST",
          ...fcc,
          last_delivery_postal_code: fiveDigitPostalCode(
            fcc.last_delivery_address
          ),
          last_delivery_at_local: localDeliveryTimestamp(
            serviceDate,
            fcc.last_delivery_time
          ),
        };
      })
      .sort((left, right) =>
        String(left.route_label ?? left.route_key).localeCompare(
          String(right.route_label ?? right.route_key),
          undefined,
          { numeric: true }
        )
      );

    const selectedRoute = requestedRouteKey
      ? routes.find(
          (route) =>
            route.route_key === requestedRouteKey ||
            normalizeManifestRouteKey(route.route_key) ===
              normalizeManifestRouteKey(requestedRouteKey)
        ) ?? null
      : routes[0] ?? null;

    if (requestedRouteKey && !selectedRoute) {
      return NextResponse.json(
        {
          error: "That route was not reported by FCC for this date.",
          retention: window,
          service_date: serviceDate,
          routes,
        },
        { status: 404 }
      );
    }

    if (!selectedRoute) {
      return NextResponse.json({
        retention: window,
        retention_mode: "IDENTIFIABLE",
        service_date: serviceDate,
        routes: [],
        selected_route: null,
        delivery_stops: [],
        stop_clusters: [],
      });
    }

    const [stopsResult, packagesResult, clusterResult] = await Promise.all([
      supabase
        .from("operations_delivery_manifest_stop_v")
        .select(
          "id,st_number,sid,recipient,contact_name,address_line_1,address_line_2,city,state,postal_code,delivery_time_begin,delivery_time_end,package_count,stop_instructions,completed,created_at"
        )
        .eq("company_id", company.id)
        .eq("service_date", serviceDate)
        .eq("route_key", selectedRoute.route_key)
        .order("st_number", { ascending: true }),
      supabase
        .from("operations_delivery_manifest_package_v")
        .select(
          "st_number,sid,is_express,is_residential,is_signature,is_hazmat,is_collection"
        )
        .eq("company_id", company.id)
        .eq("service_date", serviceDate)
        .eq("route_key", selectedRoute.route_key),
      supabase.rpc("get_operations_manifest_stop_clusters", {
        p_company_id: company.id,
        p_service_date: serviceDate,
        p_route_key: selectedRoute.route_key,
      }),
    ]);

    const detailError = stopsResult.error ?? packagesResult.error ?? clusterResult.error;
    if (detailError) {
      return NextResponse.json(
        { error: detailError.message, retention: window, routes },
        { status: 500 }
      );
    }

    const packageSummary = new Map<string, StopPackageSummary>();
    for (const row of (packagesResult.data ?? []) as Array<
      Record<string, unknown>
    >) {
      const key = packageStopKey(row);
      const current = packageSummary.get(key) ?? {
        count: 0,
        express: 0,
        signature: 0,
        hazmat: 0,
        residential: 0,
        collection: 0,
      };
      current.count += 1;
      current.express += row.is_express ? 1 : 0;
      current.signature += row.is_signature ? 1 : 0;
      current.hazmat += row.is_hazmat ? 1 : 0;
      current.residential += row.is_residential ? 1 : 0;
      current.collection += row.is_collection ? 1 : 0;
      packageSummary.set(key, current);
    }

    const deliveryStops: DeliveryStopDetail[] = ((
      stopsResult.data ?? []
    ) as Array<Record<string, unknown>>).map((stop) => ({
      ...stop,
      package_summary: packageSummary.get(packageStopKey(stop)) ?? {
        count: Number(stop.package_count ?? 0),
        express: 0,
        signature: 0,
        hazmat: 0,
        residential: 0,
        collection: 0,
      },
    }));

    const fccLastAddress = normalizeAddress(selectedRoute.last_delivery_address);
    const addressMatchedStop = fccLastAddress
      ? deliveryStops.find((stop) => {
          const candidate = normalizeAddress(stopAddress(stop));
          return (
            candidate === fccLastAddress ||
            candidate.includes(fccLastAddress) ||
            fccLastAddress.includes(candidate)
          );
        }) ?? null
      : null;
    const fallbackFinalStop = selectedRoute.deliveries_complete
      ? [...deliveryStops].sort(
          (left, right) =>
            stopSequence(right.st_number) - stopSequence(left.st_number)
        )[0] ?? null
      : null;
    const lastDeliveryStop = addressMatchedStop ?? fallbackFinalStop;
    const lastDeliveryStopMatch = addressMatchedStop
      ? "FCC_ADDRESS"
      : fallbackFinalStop
        ? "COMPLETED_ROUTE_SEQUENCE"
        : null;

    return NextResponse.json({
      retention: window,
      retention_mode: "IDENTIFIABLE",
      service_date: serviceDate,
      routes: routes.map(publicRoute),
      selected_route: publicRoute(selectedRoute),
      last_delivery_stop: lastDeliveryStop
        ? {
            ...publicStop(lastDeliveryStop),
            match_basis: lastDeliveryStopMatch,
          }
        : null,
      delivery_stops: deliveryStops.map((stop) => ({
        ...publicStop(stop),
        is_last_delivery: lastDeliveryStop?.id === stop.id,
          delivery_observed_at_local:
          lastDeliveryStop?.id === stop.id
            ? selectedRoute.last_delivery_at_local
            : null,
      })),
      stop_clusters: (clusterResult.data ?? []) as RouteStopCluster[],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load delivery manifest history.",
        routes: [],
      },
      { status: 500 }
    );
  }
}
