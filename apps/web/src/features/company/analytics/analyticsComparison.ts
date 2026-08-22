import type { OperationsHistoryRow } from "./operationsHistory.types";

export type ComparisonCoverage = "strong" | "limited" | "insufficient";
export type ComparisonTone = "positive" | "negative" | "neutral";
export type ComparisonFormat = "number" | "decimal" | "percent" | "points";

export type AnalyticsComparisonMetric = {
  key:
    | "stops_per_day"
    | "packages_per_day"
    | "routes_per_day"
    | "stops_per_route"
    | "service_codes"
    | "ils";
  label: string;
  current: number | null;
  comparison: number | null;
  delta: number | null;
  format: ComparisonFormat;
  tone: ComparisonTone;
};

export type AnalyticsComparisonBrief = {
  coverage: ComparisonCoverage;
  coverageLabel: string;
  currentOperatingDays: number;
  comparisonOperatingDays: number;
  headline: string;
  reading: string;
  metrics: AnalyticsComparisonMetric[];
};

type PeriodSummary = {
  operatingDays: number;
  stopsPerDay: number;
  packagesPerDay: number;
  routesPerDay: number;
  stopsPerRoute: number;
  serviceCodesPerThousand: number | null;
  ilsPercent: number | null;
};

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function availableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratio(value: number, denominator: number): number {
  return denominator > 0 ? value / denominator : 0;
}

function percentChange(current: number | null, comparison: number | null) {
  if (current === null || comparison === null || comparison <= 0) return null;
  return ((current - comparison) / comparison) * 100;
}

function summarize(rows: OperationsHistoryRow[]): PeriodSummary {
  const operatingDays = rows.length;
  const routes = rows.reduce((sum, row) => sum + numeric(row.route_count), 0);
  const stops = rows.reduce((sum, row) => sum + numeric(row.total_stops), 0);
  const packages = rows.reduce((sum, row) => sum + numeric(row.total_packages), 0);
  const deliveryPackages = rows.reduce(
    (sum, row) => sum + numeric(row.actual_delivery_packages),
    0
  );
  const serviceCodes = rows.reduce(
    (sum, row) =>
      sum + numeric(row.code_85) + numeric(row.dna) + numeric(row.send_again),
    0
  );
  const ilsRows = rows
    .map((row) => ({
      value: availableNumber(row.ils_percent),
      weight: numeric(row.ils_impact_packages),
    }))
    .filter((row): row is { value: number; weight: number } => row.value !== null);
  const ilsWeight = ilsRows.reduce((sum, row) => sum + row.weight, 0);
  const ilsPercent = !ilsRows.length
    ? null
    : ilsWeight > 0
      ? ilsRows.reduce((sum, row) => sum + row.value * row.weight, 0) /
        ilsWeight
      : ilsRows.reduce((sum, row) => sum + row.value, 0) / ilsRows.length;

  return {
    operatingDays,
    stopsPerDay: ratio(stops, operatingDays),
    packagesPerDay: ratio(packages, operatingDays),
    routesPerDay: ratio(routes, operatingDays),
    stopsPerRoute: ratio(stops, routes),
    serviceCodesPerThousand:
      deliveryPackages > 0 ? (serviceCodes / deliveryPackages) * 1_000 : null,
    ilsPercent,
  };
}

function direction(delta: number | null): "up" | "down" | "flat" {
  if (delta === null || Math.abs(delta) < 0.5) return "flat";
  return delta > 0 ? "up" : "down";
}

function metricTone(
  key: AnalyticsComparisonMetric["key"],
  delta: number | null
): ComparisonTone {
  if (delta === null) return "neutral";

  if (key === "stops_per_route" && Math.abs(delta) < 3) {
    return "neutral";
  }

  if (key === "service_codes" && Math.abs(delta) < 5) {
    return "neutral";
  }

  if (key === "ils" && Math.abs(delta) < 0.25) {
    return "neutral";
  }

  const movement = direction(delta);
  if (movement === "flat") return "neutral";

  if (key === "service_codes") {
    return movement === "down" ? "positive" : "negative";
  }

  if (key === "ils") {
    return movement === "up" ? "positive" : "negative";
  }

  if (key === "stops_per_route") {
    return movement === "up" ? "negative" : "positive";
  }

  return "neutral";
}

function percentMetric(
  key: AnalyticsComparisonMetric["key"],
  label: string,
  current: number | null,
  comparison: number | null,
  format: ComparisonFormat
): AnalyticsComparisonMetric {
  const delta = percentChange(current, comparison);
  return {
    key,
    label,
    current,
    comparison,
    delta,
    format,
    tone: metricTone(key, delta),
  };
}

function signed(value: number | null): string {
  if (value === null) return "not available";
  const rounded = Math.abs(value).toFixed(1);
  if (Math.abs(value) < 0.05) return "flat";
  return `${value > 0 ? "+" : "−"}${rounded}%`;
}

export function buildAnalyticsComparisonBrief(
  currentRows: OperationsHistoryRow[],
  comparisonRows: OperationsHistoryRow[]
): AnalyticsComparisonBrief | null {
  if (currentRows.length === 0 || comparisonRows.length === 0) return null;

  const current = summarize(currentRows);
  const comparison = summarize(comparisonRows);
  const coverageRatio =
    Math.min(current.operatingDays, comparison.operatingDays) /
    Math.max(current.operatingDays, comparison.operatingDays);
  const coverage: ComparisonCoverage =
    Math.min(current.operatingDays, comparison.operatingDays) < 3 ||
    coverageRatio < 0.5
      ? "insufficient"
      : coverageRatio < 0.8
        ? "limited"
        : "strong";
  const coverageLabel =
    coverage === "strong"
      ? "Comparable coverage"
      : coverage === "limited"
        ? "Directional comparison"
        : "Insufficient overlap";

  const stopsDelta = percentChange(current.stopsPerDay, comparison.stopsPerDay);
  const routesDelta = percentChange(current.routesPerDay, comparison.routesPerDay);
  const densityDelta = percentChange(
    current.stopsPerRoute,
    comparison.stopsPerRoute
  );
  const serviceDelta = percentChange(
    current.serviceCodesPerThousand,
    comparison.serviceCodesPerThousand
  );
  const ilsDelta =
    current.ilsPercent !== null && comparison.ilsPercent !== null
      ? current.ilsPercent - comparison.ilsPercent
      : null;

  let headline = "Operating shape is broadly aligned.";
  if (coverage === "insufficient") {
    headline = "More comparable history is required.";
  } else if (
    (serviceDelta !== null && serviceDelta >= 20) ||
    (ilsDelta !== null && ilsDelta <= -0.5)
  ) {
    headline = "Service pressure is the primary change.";
  } else if (
    serviceDelta !== null &&
    serviceDelta <= -20 &&
    (ilsDelta === null || ilsDelta >= 0)
  ) {
    headline = "Service improved versus the comparison period.";
  } else if (
    stopsDelta !== null &&
    routesDelta !== null &&
    stopsDelta - routesDelta >= 5
  ) {
    headline = "Demand is outpacing route deployment.";
  } else if (stopsDelta !== null && stopsDelta <= -5) {
    headline = "Demand eased versus the comparison period.";
  } else if (
    stopsDelta !== null &&
    routesDelta !== null &&
    routesDelta - stopsDelta >= 5
  ) {
    headline = "Route deployment expanded ahead of demand.";
  }

  const serviceReading =
    serviceDelta === null
      ? "Service-code comparison is unavailable."
      : Math.abs(serviceDelta) < 0.5
        ? "Service-code pressure held flat."
        : serviceDelta > 0
          ? `Service-code pressure increased ${Math.abs(serviceDelta).toFixed(1)}%.`
          : `Service-code pressure improved ${Math.abs(serviceDelta).toFixed(1)}%.`;
  const reading =
    coverage === "insufficient"
      ? `${current.operatingDays} current operating days are being compared with ${comparison.operatingDays}. Normalized metrics are shown for orientation, but no trend conclusion should be drawn.`
      : `Stops/day ${signed(stopsDelta)} while routes/day ${signed(routesDelta)}. Route density ${signed(densityDelta)}. ${serviceReading}`;

  return {
    coverage,
    coverageLabel,
    currentOperatingDays: current.operatingDays,
    comparisonOperatingDays: comparison.operatingDays,
    headline,
    reading,
    metrics: [
      percentMetric(
        "stops_per_day",
        "Stops / day",
        current.stopsPerDay,
        comparison.stopsPerDay,
        "number"
      ),
      percentMetric(
        "packages_per_day",
        "Packages / day",
        current.packagesPerDay,
        comparison.packagesPerDay,
        "number"
      ),
      percentMetric(
        "routes_per_day",
        "Routes / day",
        current.routesPerDay,
        comparison.routesPerDay,
        "decimal"
      ),
      percentMetric(
        "stops_per_route",
        "Stops / route",
        current.stopsPerRoute,
        comparison.stopsPerRoute,
        "decimal"
      ),
      percentMetric(
        "service_codes",
        "Codes / 1k",
        current.serviceCodesPerThousand,
        comparison.serviceCodesPerThousand,
        "decimal"
      ),
      {
        key: "ils",
        label: "ILS",
        current: current.ilsPercent,
        comparison: comparison.ilsPercent,
        delta: ilsDelta,
        format: "percent",
        tone: metricTone("ils", ilsDelta),
      },
    ],
  };
}
