type SnapshotRow = {
  summary_scope?: string | null;
  summary_label?: string | null;
  normalized_row_json?: Record<string, unknown> | null;
};

type SnapshotPayload = {
  rows?: SnapshotRow[] | null;
} | null;

type HistoricalFccEvidence = {
  last_delivery_time?: string | null;
  last_pickup_time?: string | null;
  last_transmission_time?: string | null;
  deliveries_complete?: boolean | null;
  pickup_complete?: boolean | null;
  final_stop_time?: string | null;
};

function finiteNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function contractMetrics(payload: SnapshotPayload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const contract =
    rows.find((row) => String(row.summary_scope ?? "").toUpperCase() === "CONTRACT") ??
    rows.find((row) => String(row.summary_label ?? "").toLowerCase().includes("contract")) ??
    null;

  return contract?.normalized_row_json ?? {};
}

export function hasHistoricalFccEvidence(
  row: HistoricalFccEvidence | null | undefined
) {
  if (!row) return false;
  return Boolean(
    String(row.last_delivery_time ?? "").trim() ||
    String(row.last_pickup_time ?? "").trim() ||
    String(row.last_transmission_time ?? "").trim() ||
    row.deliveries_complete ||
    row.pickup_complete ||
    String(row.final_stop_time ?? "").trim()
  );
}

export function historicalServiceSummary(
  payload: SnapshotPayload,
  reportedRouteCount: number
) {
  const metrics = contractMetrics(payload);
  const plannedPackages = finiteNumber(metrics.vscan_packages);
  const actualPackages = finiteNumber(metrics.actual_delivery_packages);
  const plannedStops = finiteNumber(metrics.planned_delivery_stops);
  const actualStops = finiteNumber(metrics.actual_delivery_stops);
  const plannedPickupStops = finiteNumber(metrics.planned_pickup_stops);
  const actualPickupStops = finiteNumber(metrics.actual_pickup_stops);
  const completionBase = plannedStops || plannedPackages;
  const completionActual = plannedStops ? actualStops : actualPackages;

  return {
    reportedRoutes: Math.max(0, reportedRouteCount),
    plannedPackages,
    actualPackages,
    plannedStops,
    actualStops,
    plannedPickupStops,
    actualPickupStops,
    completion: completionBase
      ? Math.min(100, Math.round((completionActual / completionBase) * 100))
      : 0,
  };
}

export function historicalRouteSignal(input: {
  hasDsw: boolean;
  hasFcc: boolean;
  hasManifest: boolean;
  hasDispatchAssignment: boolean;
}) {
  if (input.hasDsw) {
    return { label: "DSW route record", tone: "#166534", icon: "●", key: "historical_dsw" };
  }
  if (input.hasFcc) {
    return { label: "FCC route record", tone: "#166534", icon: "●", key: "historical_fcc" };
  }
  if (input.hasManifest) {
    return { label: "Manifest retained", tone: "#1d4ed8", icon: "●", key: "historical_manifest" };
  }
  if (input.hasDispatchAssignment) {
    return { label: "Dispatch assignment", tone: "#475569", icon: "●", key: "historical_dispatch" };
  }
  return { label: "Selected-day route record", tone: "#64748b", icon: "●", key: "historical_record" };
}

export function historicalRouteEvidenceLabel(input: {
  hasDsw: boolean;
  hasFcc: boolean;
  hasManifest: boolean;
  hasDispatchAssignment: boolean;
}) {
  if (input.hasDsw) return "DSW";
  if (input.hasFcc) return "FCC";
  if (input.hasManifest) return "Manifest";
  if (input.hasDispatchAssignment) return "Dispatch";
  return "Evidence";
}
