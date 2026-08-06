import type {
  DriverPeriodSummary,
  DriverScorecardIndexRow,
  ScorecardMetric,
} from "./driverScorecard.types";
import {
  calculatePickupReliability,
  type PriTier,
} from "../pickupReliability";

export function scorecardNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type PickupContribution = {
  status: "NO_SAMPLE" | "INCOMPLETE" | "SCORED";
  points: number | null;
  contribution: number | null;
  pri: number | null;
  tier: PriTier | null;
};

export function hasPickupExceptionActivity(
  period: Pick<
    DriverPeriodSummary,
    "early_pickups" | "late_pickups" | "potential_missed_pickups"
  >,
) {
  return (
    scorecardNumber(period.early_pickups) > 0 ||
    scorecardNumber(period.late_pickups) > 0 ||
    scorecardNumber(period.potential_missed_pickups) > 0
  );
}

export function pickupContribution(
  period: DriverPeriodSummary,
  metric: ScorecardMetric | undefined,
): PickupContribution {
  if (!metric || scorecardNumber(period.pickup_stops) <= 0) {
    return {
      status: "NO_SAMPLE",
      points: null,
      contribution: null,
      pri: null,
      tier: null,
    };
  }

  const reliability = calculatePickupReliability({
    pickupStops: period.pickup_stops,
    earlyPickups: period.early_pickups,
    latePickups: period.late_pickups,
    potentialMissedPickups: period.potential_missed_pickups,
    complete: period.pickup_reliability_complete === true,
  });

  if (reliability.pri == null || reliability.tier == null) {
    return {
      status: "INCOMPLETE",
      points: null,
      contribution: null,
      pri: null,
      tier: null,
    };
  }

  const pointsByTier: Record<PriTier, number> = {
    T4: scorecardNumber(metric.points_primary),
    T3: scorecardNumber(metric.points_secondary),
    T2: scorecardNumber(metric.points_tertiary),
    T1: 0,
  };
  const points = pointsByTier[reliability.tier];
  const contribution =
    Math.round(
      ((points / 10) * scorecardNumber(metric.contribution_weight) +
        Number.EPSILON) *
        1_000,
    ) / 1_000;

  return {
    status: "SCORED",
    points,
    contribution,
    pri: reliability.pri,
    tier: reliability.tier,
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
  if (metric.scoring_method === "PRI_TIER") {
    return `T4 < ${scorecardNumber(metric.target_primary).toFixed(3)} (${scorecardNumber(metric.points_primary)} pts) · T3 ≤ ${scorecardNumber(metric.target_secondary).toFixed(3)} (${scorecardNumber(metric.points_secondary)} pts) · T2 ≤ ${scorecardNumber(metric.target_tertiary).toFixed(3)} (${scorecardNumber(metric.points_tertiary)} pts) · T1 > ${scorecardNumber(metric.target_tertiary).toFixed(3)} (0 pts)`;
  }

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
