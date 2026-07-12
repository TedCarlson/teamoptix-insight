import type {
  OperationsHistoryRow,
} from "./operationsHistory.types";

export type AnalyticsDashboardSummary = {
  latest: OperationsHistoryRow | null;
  previousOperatingDays: OperationsHistoryRow[];
  previousOperatingDayCount: number;
  averageWeekdayRoutes: number | null;
  averageWeekendRoutes: number | null;
  previousAverageRoutes: number | null;
  previousAverageStops: number | null;
  previousAveragePackages: number | null;
  routeDeltaPercent: number | null;
  stopDeltaPercent: number | null;
  packageDeltaPercent: number | null;
  demandSignal: "HOT" | "WARM" | "NORMAL" | "SOFT" | "COOL" | "NO_BASELINE";
};

export function analyticsNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function average(
  rows: OperationsHistoryRow[],
  select: (row: OperationsHistoryRow) => unknown
): number | null {
  const values = rows
    .map((row) => analyticsNumber(select(row)))
    .filter((value): value is number => value !== null);

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentDelta(
  current: number | null,
  baseline: number | null
): number | null {
  if (current === null || baseline === null || baseline === 0) {
    return null;
  }

  return ((current - baseline) / baseline) * 100;
}

function demandSignal(
  stopDelta: number | null,
  packageDelta: number | null
): AnalyticsDashboardSummary["demandSignal"] {
  const available = [stopDelta, packageDelta].filter(
    (value): value is number => value !== null
  );

  if (!available.length) {
    return "NO_BASELINE";
  }

  const delta =
    available.reduce((sum, value) => sum + value, 0) /
    available.length;

  const magnitude = Math.abs(delta);

  if (magnitude >= 10) {
    return delta > 0 ? "HOT" : "COOL";
  }

  if (magnitude >= 5) {
    return delta > 0 ? "WARM" : "SOFT";
  }

  return "NORMAL";
}

export function summarizeOperationsHistory(
  inputRows: OperationsHistoryRow[]
): AnalyticsDashboardSummary {
  const rows = [...inputRows].sort((a, b) =>
    a.service_date.localeCompare(b.service_date)
  );

  const latest = rows.at(-1) ?? null;
  const previousOperatingDays = rows.slice(0, -1).slice(-14);

  const previousAverageRoutes = average(
    previousOperatingDays,
    (row) => row.route_count
  );
  const previousAverageStops = average(
    previousOperatingDays,
    (row) => row.actual_delivery_stops
  );
  const previousAveragePackages = average(
    previousOperatingDays,
    (row) => row.actual_delivery_packages
  );

  const routeDeltaPercent = percentDelta(
    analyticsNumber(latest?.route_count),
    previousAverageRoutes
  );
  const stopDeltaPercent = percentDelta(
    analyticsNumber(latest?.actual_delivery_stops),
    previousAverageStops
  );
  const packageDeltaPercent = percentDelta(
    analyticsNumber(latest?.actual_delivery_packages),
    previousAveragePackages
  );

  return {
    latest,
    previousOperatingDays,
    previousOperatingDayCount: previousOperatingDays.length,
    averageWeekdayRoutes: average(
      rows.filter((row) => row.is_weekday),
      (row) => row.route_count
    ),
    averageWeekendRoutes: average(
      rows.filter((row) => row.is_weekend),
      (row) => row.route_count
    ),
    previousAverageRoutes,
    previousAverageStops,
    previousAveragePackages,
    routeDeltaPercent,
    stopDeltaPercent,
    packageDeltaPercent,
    demandSignal: demandSignal(
      stopDeltaPercent,
      packageDeltaPercent
    ),
  };
}
