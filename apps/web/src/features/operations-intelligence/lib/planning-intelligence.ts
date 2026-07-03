import type { PlanningFrame } from "./planning-frame";

export type DroPlanRowForIntelligence = {
  route_baseline_id?: string | null;
  route_name?: string | null;
  wa_number?: string | null;
  stops?: number | string | null;
  packages?: number | string | null;
};

export type RouteHistoryRowForIntelligence = {
  service_date?: string | null;
  route_baseline_id?: string | null;
  route_name?: string | null;
  wa_number?: string | null;
  actual_delivery_stops?: number | string | null;
};

export type PlanningAssignmentForIntelligence = {
  source: "Dispatch" | "Schedule";
};

export type RouteDemandStatus =
  | "NO_ROUTE"
  | "LIMITED"
  | "HEAVY"
  | "LIGHT"
  | "SHIFTED"
  | "NORMAL";

export type RouteDemandSignal = {
  label: string;
  detail: string;
  tone: string;
  deltaPct: number;
  sampleSize: number;
  status: RouteDemandStatus;
  avgStops: number | null;
  plannedStops: number;
};

export type PlanningIntelligenceSummary = {
  assignedRoutes: number;
  openSeats: number;
  dispatchAssignments: number;
  scheduleAssignments: number;
  unassignedRoutes: number;
  avgStops: number;
  historicalAvgStops: number | null;
  volumeDeltaPct: number | null;
  peakRoute: DroPlanRowForIntelligence | null;
  routesAboveAverage: number;
  routesBelowAverage: number;
  heavyRoutes: number;
  lightRoutes: number;
  normalRoutes: number;
  limitedHistoryRoutes: number;
  readinessLabel: string;
  intelligenceLabel: string;
  intelligenceDetail: string;
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: unknown, digits = 0) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "—";

  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function cleanRouteKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function routeLookupKeys(row: {
  route_baseline_id?: string | null;
  wa_number?: string | null;
  route_name?: string | null;
}) {
  return [
    row.route_baseline_id ? cleanRouteKey(String(row.route_baseline_id)) : "",
    row.wa_number ? cleanRouteKey(String(row.wa_number)) : "",
    row.route_name ? cleanRouteKey(String(row.route_name)) : "",
  ].filter(Boolean);
}

export function buildHistoryByRouteKey(historyRows: RouteHistoryRowForIntelligence[]) {
  const map = new Map<string, RouteHistoryRowForIntelligence[]>();

  for (const historyRow of historyRows) {
    for (const key of routeLookupKeys(historyRow)) {
      const bucket = map.get(key) ?? [];
      bucket.push(historyRow);
      map.set(key, bucket);
    }
  }

  return map;
}

export function buildRouteDemandSignal(params: {
  row: DroPlanRowForIntelligence | null;
  historyByRouteKey: Map<string, RouteHistoryRowForIntelligence[]>;
}): RouteDemandSignal {
  const { row, historyByRouteKey } = params;

  if (!row) {
    return {
      label: "No route selected",
      detail: "Select a route",
      tone: "#64748b",
      deltaPct: 0,
      sampleSize: 0,
      status: "NO_ROUTE",
      avgStops: null,
      plannedStops: 0,
    };
  }

  const historyRows = routeLookupKeys(row).flatMap((key) => historyByRouteKey.get(key) ?? []);
  const unique = new Map<string, RouteHistoryRowForIntelligence>();

  for (const historyRow of historyRows) {
    const id = [
      historyRow.service_date,
      historyRow.route_baseline_id,
      historyRow.wa_number,
      historyRow.route_name,
    ]
      .filter(Boolean)
      .join("|");

    if (id) unique.set(id, historyRow);
  }

  const samples = Array.from(unique.values())
    .map((historyRow) => n(historyRow.actual_delivery_stops))
    .filter((value) => value > 0);

  const plannedStops = n(row.stops);

  if (samples.length < 4) {
    return {
      label: "Limited history",
      detail: `${samples.length} comparable days`,
      tone: "#64748b",
      deltaPct: 0,
      sampleSize: samples.length,
      status: "LIMITED",
      avgStops: null,
      plannedStops,
    };
  }

  const avgStops = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const deltaPct = avgStops > 0 ? ((plannedStops - avgStops) / avgStops) * 100 : 0;
  const absDelta = Math.abs(deltaPct);

  if (deltaPct >= 20) {
    return {
      label: "Heavy demand",
      detail: `+${fmt(deltaPct, 1)}% vs history`,
      tone: "#b45309",
      deltaPct,
      sampleSize: samples.length,
      status: "HEAVY",
      avgStops,
      plannedStops,
    };
  }

  if (deltaPct <= -20) {
    return {
      label: "Light demand",
      detail: `${fmt(deltaPct, 1)}% vs history`,
      tone: "#0369a1",
      deltaPct,
      sampleSize: samples.length,
      status: "LIGHT",
      avgStops,
      plannedStops,
    };
  }

  if (absDelta >= 10) {
    return {
      label: deltaPct > 0 ? "Above normal" : "Below normal",
      detail: `${deltaPct > 0 ? "+" : ""}${fmt(deltaPct, 1)}% vs history`,
      tone: "#475569",
      deltaPct,
      sampleSize: samples.length,
      status: "SHIFTED",
      avgStops,
      plannedStops,
    };
  }

  return {
    label: "Normal demand",
    detail: `${fmt(plannedStops)} vs ${fmt(avgStops, 1)} avg`,
    tone: "#166534",
    deltaPct,
    sampleSize: samples.length,
    status: "NORMAL",
    avgStops,
    plannedStops,
  };
}

function buildBriefing(params: {
  frame: PlanningFrame;
  routes: number;
  openSeats: number;
  assignedRoutes: number;
  routesAboveAverage: number;
  routesBelowAverage: number;
  heavyRoutes: number;
  lightRoutes: number;
  limitedHistoryRoutes: number;
  volumeDeltaPct: number | null;
}) {
  const {
    frame,
    routes,
    openSeats,
    assignedRoutes,
    routesAboveAverage,
    routesBelowAverage,
    heavyRoutes,
    lightRoutes,
    limitedHistoryRoutes,
    volumeDeltaPct,
  } = params;

  if (frame === "AWAITING_PM_PLAN") {
    return {
      label: "Today's service has advanced far enough to await the next PM planning upload.",
      detail: "Insight has advanced the planning frame and is waiting for today's PM plan for tomorrow's operation.",
    };
  }

  if (frame === "NON_OPERATIONAL") {
    return {
      label: "No active service signal has appeared for today.",
      detail: "This may be a non-operational day, holiday, weather exception, or a day with no uploaded service activity yet.",
    };
  }

  const subject = frame === "PM_PLANNING" ? "Tomorrow" : "Today's operation";
  const assignmentText =
    openSeats > 0
      ? `${assignedRoutes} of ${routes} planned routes have driver assignments, leaving ${openSeats} ${openSeats === 1 ? "route" : "routes"} still awaiting assignment.`
      : `All ${routes} planned routes currently have driver assignments.`;

  const volumeText =
    volumeDeltaPct === null
      ? "Overall volume is still building a reliable historical comparison."
      : volumeDeltaPct >= 1
        ? `Overall planned stop volume is ${fmt(volumeDeltaPct, 1)}% above historical average.`
        : volumeDeltaPct <= -1
          ? `Overall planned stop volume is ${fmt(Math.abs(volumeDeltaPct), 1)}% below historical average.`
          : "Overall planned stop volume is in line with historical average.";

  const pressureParts = [];
  if (routesAboveAverage > 0) {
    pressureParts.push(`${routesAboveAverage} ${routesAboveAverage === 1 ? "route is" : "routes are"} above normal`);
  }
  if (heavyRoutes > 0) {
    pressureParts.push(`${heavyRoutes} ${heavyRoutes === 1 ? "route is" : "routes are"} heavy`);
  }
  if (routesBelowAverage > 0) {
    pressureParts.push(`${routesBelowAverage} ${routesBelowAverage === 1 ? "route is" : "routes are"} below normal`);
  }
  if (lightRoutes > 0) {
    pressureParts.push(`${lightRoutes} ${lightRoutes === 1 ? "route is" : "routes are"} light`);
  }

  const pressureText =
    pressureParts.length > 0
      ? `Route mix shows ${pressureParts.join(", ")}.`
      : limitedHistoryRoutes > 0
        ? `${limitedHistoryRoutes} ${limitedHistoryRoutes === 1 ? "route has" : "routes have"} limited history, but the remaining routes align with recent patterns.`
        : "Route mix is aligned with recent operating history.";

  const label =
    openSeats > 0
      ? `${subject} looks manageable, with driver assignment still in progress.`
      : `${subject} looks manageable with current driver coverage.`;

  return {
    label,
    detail: `${assignmentText} ${volumeText} ${pressureText}`,
  };
}

export function buildPlanningIntelligence(params: {
  rows: DroPlanRowForIntelligence[];
  routeSignals: RouteDemandSignal[];
  assignmentForRow: (row: DroPlanRowForIntelligence) => PlanningAssignmentForIntelligence | null;
  planningFrame: PlanningFrame;
}): PlanningIntelligenceSummary {
  const { rows, routeSignals, assignmentForRow, planningFrame } = params;
  const totalStops = rows.reduce((sum, row) => sum + n(row.stops), 0);
  const assignmentRows = rows.map((row) => assignmentForRow(row));
  const dispatchAssignments = assignmentRows.filter((item) => item?.source === "Dispatch").length;
  const scheduleAssignments = assignmentRows.filter((item) => item?.source === "Schedule").length;
  const assignedRoutes = dispatchAssignments + scheduleAssignments;
  const openSeats = Math.max(0, rows.length - assignedRoutes);
  const avgStops = rows.length ? totalStops / rows.length : 0;

  const comparableSignals = routeSignals.filter((signal) => signal.avgStops !== null);
  const historicalTotalStops = comparableSignals.reduce((sum, signal) => sum + (signal.avgStops ?? 0), 0);
  const plannedComparableStops = comparableSignals.reduce((sum, signal) => sum + signal.plannedStops, 0);
  const volumeDeltaPct =
    historicalTotalStops > 0
      ? ((plannedComparableStops - historicalTotalStops) / historicalTotalStops) * 100
      : null;

  const peakRoute = rows.reduce<DroPlanRowForIntelligence | null>((peak, row) => {
    if (!peak) return row;
    return n(row.stops) > n(peak.stops) ? row : peak;
  }, null);

  const routesAboveAverage = routeSignals.filter(
    (signal) => signal.status === "HEAVY" || (signal.status === "SHIFTED" && signal.deltaPct > 0)
  ).length;
  const routesBelowAverage = routeSignals.filter(
    (signal) => signal.status === "LIGHT" || (signal.status === "SHIFTED" && signal.deltaPct < 0)
  ).length;
  const heavyRoutes = routeSignals.filter((signal) => signal.status === "HEAVY").length;
  const lightRoutes = routeSignals.filter((signal) => signal.status === "LIGHT").length;
  const normalRoutes = routeSignals.filter((signal) => signal.status === "NORMAL").length;
  const limitedHistoryRoutes = routeSignals.filter((signal) => signal.status === "LIMITED").length;

  const briefing = buildBriefing({
    frame: planningFrame,
    routes: rows.length,
    openSeats,
    assignedRoutes,
    routesAboveAverage,
    routesBelowAverage,
    heavyRoutes,
    lightRoutes,
    limitedHistoryRoutes,
    volumeDeltaPct,
  });

  return {
    assignedRoutes,
    openSeats,
    dispatchAssignments,
    scheduleAssignments,
    unassignedRoutes: openSeats,
    avgStops,
    historicalAvgStops: comparableSignals.length ? historicalTotalStops / comparableSignals.length : null,
    volumeDeltaPct,
    peakRoute,
    routesAboveAverage,
    routesBelowAverage,
    heavyRoutes,
    lightRoutes,
    normalRoutes,
    limitedHistoryRoutes,
    readinessLabel:
      openSeats === 0
        ? "Driver coverage ready"
        : `${openSeats} open driver ${openSeats === 1 ? "seat" : "seats"}`,
    intelligenceLabel: briefing.label,
    intelligenceDetail: briefing.detail,
  };
}
