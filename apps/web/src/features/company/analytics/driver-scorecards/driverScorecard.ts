import type {
  DriverPeriodSummary,
  DriverScorecardIndexRow,
  ScorecardMetric,
} from "./driverScorecard.types";

export function scorecardNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type PickupContribution = {
  status: "NO_SAMPLE" | "UNDER_REVIEW" | "SCORED";
  points: number | null;
  contribution: number | null;
};

export function pickupContribution(
  period: DriverPeriodSummary,
  metric: ScorecardMetric | undefined,
): PickupContribution {
  if (!metric || scorecardNumber(period.pickup_stops) <= 0) {
    return { status: "NO_SAMPLE", points: null, contribution: null };
  }

  if (scorecardNumber(period.potential_missed_pickups) > 0) {
    return { status: "UNDER_REVIEW", points: null, contribution: null };
  }

  const failed =
    scorecardNumber(period.early_pickups) +
      scorecardNumber(period.late_pickups) >
    0;
  const points = failed ? 0 : 10;

  return {
    status: "SCORED",
    points,
    contribution: (points / 10) * scorecardNumber(metric.contribution_weight),
  };
}

export function warehouseCoverage(metrics: ScorecardMetric[]): number {
  return metrics
    .filter((metric) => metric.source_mode === "WAREHOUSE")
    .reduce(
      (sum, metric) => sum + scorecardNumber(metric.contribution_weight),
      0,
    );
}

export function sourceLabel(metric: ScorecardMetric): string {
  if (metric.source_mode === "WAREHOUSE") return "Warehouse connected";
  if (metric.source_mode === "EVENT_LEDGER") return "Event entry needed";
  if (metric.source_mode === "CLIENT_ENTRY") return "Client entry needed";
  return "FedEx source needed";
}

export function standardLabel(metric: ScorecardMetric): string {
  if (metric.scoring_method === "RYDE_NET") {
    return "Positive less negative survey points";
  }

  if (metric.scoring_method === "BINARY_ZERO") {
    return "0 confirmed failures";
  }

  const bands = [
    [metric.target_primary, metric.points_primary, "Full"],
    [metric.target_secondary, metric.points_secondary, "Mid"],
    [metric.target_tertiary, metric.points_tertiary, "Base"],
  ]
    .filter(([target]) => target != null)
    .map(
      ([target, points, label]) =>
        `${label} ≥ ${scorecardNumber(target)}%${points == null ? "" : ` (${scorecardNumber(points)} pts)`}`,
    );

  return bands.length ? bands.join(" · ") : "Source-defined standard";
}

export function routeDayCost(
  driver: DriverScorecardIndexRow,
  period: DriverPeriodSummary,
) {
  const rate = scorecardNumber(driver.daily_pay_rate);
  const days = scorecardNumber(period.operating_days);
  const stops = scorecardNumber(period.delivery_stops);
  const estimatedLabor = rate > 0 ? rate * days : null;

  return {
    estimatedLabor,
    laborPerDay: rate > 0 ? rate : null,
    laborPerStop:
      estimatedLabor != null && stops > 0 ? estimatedLabor / stops : null,
  };
}

export function privatePublicationIdentity(
  driver: Pick<DriverScorecardIndexRow, "full_name" | "fx_id">,
  rank: number | null,
) {
  return rank != null && rank <= 5
    ? driver.full_name
    : driver.fx_id || "FX ID unavailable";
}
