import {
  clusterRouteGpxStops,
  type RouteGpxGeometry,
  type RouteGpxStopCluster,
} from "./routeGpx";

export type RouteGpxExecutionCluster = Omit<RouteGpxStopCluster, "labels"> & {
  execution_status: "OPEN" | "ATTEMPTED" | "CLOSED" | "UNKNOWN";
  stop_type: "EXPRESS" | "DELIVERY" | "PICKUP" | "UNKNOWN";
  status_observed_at_local: string | null;
  manifest_linked: boolean;
};

export type RouteGpxPresentation = Omit<RouteGpxGeometry, "points"> & {
  path: Array<{ sequence_number: number; latitude: number; longitude: number }>;
  stop_clusters: RouteGpxExecutionCluster[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function statusComplete(value: unknown) {
  return ["Y", "YES", "COMPLETE", "COMPLETED", "CLOSED"].includes(
    text(value).toUpperCase()
  );
}

function identifiers(cluster: RouteGpxStopCluster) {
  const values = {
    stop: new Set<string>(),
    st: new Set<string>(),
    sid: new Set<string>(),
    puid: new Set<string>(),
    pu: new Set<string>(),
  };
  cluster.labels.forEach((label) => {
    const matches = [
      ...label.matchAll(/\b(STOP|ST|SID|PUID|PU)\s*[#:\-]?\s*([A-Z0-9-]+)/gi),
    ];
    matches.forEach((match) => {
      const kind = match[1].toLowerCase() as keyof typeof values;
      const value = normalized(match[2]);
      if (value) values[kind].add(value);
    });
  });
  return values;
}

function addressMatches(labels: string[], row: Record<string, unknown>) {
  const semantic = normalized(labels.join(" "));
  const address = normalized(row.address_line_1);
  return address.length >= 5 && semantic.includes(address);
}

function linkedDelivery(
  cluster: RouteGpxStopCluster,
  rows: Array<Record<string, unknown>>
) {
  const ids = identifiers(cluster);
  const addressCandidates = rows.filter((row) =>
    addressMatches(cluster.labels, row)
  );
  const sidCandidates = rows.filter((row) =>
    ids.sid.has(normalized(row.sid))
  );
  if (sidCandidates.length === 1) return sidCandidates[0];
  if (sidCandidates.length > 1) {
    const narrowed = sidCandidates.filter((row) =>
      addressMatches(cluster.labels, row)
    );
    return narrowed.length === 1 ? narrowed[0] : undefined;
  }
  const stopCandidates = rows.filter((row) =>
    ids.stop.has(normalized(row.st_number)) ||
    ids.st.has(normalized(row.st_number))
  );
  if (stopCandidates.length === 1) return stopCandidates[0];
  if (stopCandidates.length > 1) {
    const narrowed = stopCandidates.filter((row) =>
      addressMatches(cluster.labels, row)
    );
    return narrowed.length === 1 ? narrowed[0] : undefined;
  }
  return addressCandidates.length === 1 ? addressCandidates[0] : undefined;
}

function timeToken(value: unknown) {
  return text(value).match(/\b\d{1,2}:\d{2}\b/)?.[0] ?? "";
}

function pickupWindow(cluster: RouteGpxStopCluster) {
  const windows = cluster.labels.flatMap((label) => {
    const match = label.match(
      /\bReady\s+(\d{1,2}:\d{2})\s*:\s*Close\s+(\d{1,2}:\d{2})\b/i
    );
    return match ? [{ ready: match[1], close: match[2] }] : [];
  });
  return windows.length === 1 ? windows[0] : null;
}

function linkedPickup(
  cluster: RouteGpxStopCluster,
  rows: Array<Record<string, unknown>>
) {
  const ids = identifiers(cluster);
  const explicitIdCandidates = rows.filter(
    (row) =>
      ids.puid.has(normalized(row.puid)) ||
      ids.pu.has(normalized(row.pickup_list))
  );
  if (explicitIdCandidates.length === 1) return explicitIdCandidates[0];
  if (explicitIdCandidates.length > 1) return undefined;

  const addressCandidates = rows.filter((row) =>
    addressMatches(cluster.labels, row)
  );
  if (addressCandidates.length === 1) return addressCandidates[0];

  const window = pickupWindow(cluster);
  if (!window) return undefined;
  const windowCandidates = rows.filter(
    (row) =>
      timeToken(row.ready_at) === window.ready &&
      timeToken(row.close_at) === window.close
  );
  if (addressCandidates.length > 1) {
    const narrowed = addressCandidates.filter((row) =>
      windowCandidates.includes(row)
    );
    return narrowed.length === 1 ? narrowed[0] : undefined;
  }
  return windowCandidates.length === 1 ? windowCandidates[0] : undefined;
}

function packagesForDelivery(
  delivery: Record<string, unknown>,
  packages: Array<Record<string, unknown>>
) {
  const sid = normalized(delivery.sid);
  const stop = normalized(delivery.st_number);
  return packages.filter(
    (row) =>
      (sid && normalized(row.sid) === sid) ||
      (stop && normalized(row.st_number) === stop)
  );
}

export function presentRouteGpx(params: {
  geometry: RouteGpxGeometry | null;
  deliveryStops: Array<Record<string, unknown>>;
  packages: Array<Record<string, unknown>>;
  pickups: Array<Record<string, unknown>>;
}): RouteGpxPresentation | null {
  const { geometry } = params;
  if (!geometry) return null;
  const trackPoints = geometry.points.filter(
    (point) => point.point_kind === "TRKPT"
  );
  const routePoints = geometry.points.filter(
    (point) => point.point_kind === "RTEPT"
  );
  const pathSource = trackPoints.length >= 2
    ? trackPoints
    : routePoints.length >= 2
      ? routePoints
      : geometry.points;
  const stopClusters = clusterRouteGpxStops(geometry.points).map((cluster) => {
    const publicCluster = {
      cluster_key: cluster.cluster_key,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      stop_count: cluster.stop_count,
      first_sequence: cluster.first_sequence,
      last_sequence: cluster.last_sequence,
    };
    const delivery = linkedDelivery(cluster, params.deliveryStops);
    const pickup = linkedPickup(cluster, params.pickups);
    if (delivery) {
      const packages = packagesForDelivery(delivery, params.packages);
      const completed =
        statusComplete(delivery.completed) ||
        packages.some(
          (row) => text(row.delivery_evidence_state).toUpperCase() === "COMPLETED"
        );
      const attempted = packages.some((row) =>
        ["CODED_ATTEMPT", "COMPLETED"].includes(
          text(row.delivery_evidence_state).toUpperCase()
        )
      );
      const express = packages.some((row) => row.is_express === true);
      const observedAt = packages
        .map(
          (row) =>
            text(row.star_scan_at_local) || text(row.vision_label_at_local)
        )
        .filter(Boolean)
        .sort()
        .at(-1);
      return {
        ...publicCluster,
        execution_status: completed ? "CLOSED" : attempted ? "ATTEMPTED" : "OPEN",
        stop_type: express ? "EXPRESS" : "DELIVERY",
        status_observed_at_local: observedAt || null,
        manifest_linked: true,
      } satisfies RouteGpxExecutionCluster;
    }
    if (pickup) {
      const closedAt = text(pickup.pu_closed_at);
      const attempted = Number(pickup.packages_picked_up ?? 0) > 0 || Boolean(text(pickup.reason_code));
      return {
        ...publicCluster,
        execution_status: closedAt ? "CLOSED" : attempted ? "ATTEMPTED" : "OPEN",
        stop_type: "PICKUP",
        status_observed_at_local: closedAt || null,
        manifest_linked: true,
      } satisfies RouteGpxExecutionCluster;
    }
    return {
      ...publicCluster,
      execution_status: "UNKNOWN",
      stop_type: "UNKNOWN",
      status_observed_at_local: null,
      manifest_linked: false,
    } satisfies RouteGpxExecutionCluster;
  });

  return {
    route_key: geometry.route_key,
    route_label: geometry.route_label,
    track_name: geometry.track_name,
    source_point_count: geometry.source_point_count,
    retained_point_count: geometry.retained_point_count,
    stop_point_count: geometry.stop_point_count,
    processed_at: geometry.processed_at,
    path: pathSource.map((point) => ({
      sequence_number: point.sequence_number,
      latitude: point.latitude,
      longitude: point.longitude,
    })),
    stop_clusters: stopClusters,
  };
}
