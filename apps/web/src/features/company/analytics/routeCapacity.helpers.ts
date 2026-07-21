import type {
  DailyRouteCapacitySummary,
  RouteCapacityRow,
} from "./routeCapacity.types";

export function routeCapacityNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableRatio(
  numerator: number,
  denominator: number
): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function summarizeRouteCapacityByDay(
  rows: RouteCapacityRow[]
): DailyRouteCapacitySummary[] {
  const byDate = new Map<string, DailyRouteCapacitySummary>();

  for (const row of rows) {
    const current =
      byDate.get(row.service_date) ??
      {
        service_date: row.service_date,
        weekday_number: row.weekday_number,

        dispatched_route_count: 0,
        baseline_route_count: 0,
        supplemental_route_count: 0,
        pickup_only_route_count: 0,
        excluded_route_count: 0,

        light_baseline_count: 0,
        normal_baseline_count: 0,
        heavy_baseline_count: 0,
        extreme_baseline_count: 0,

        planned_delivery_stops: 0,
        actual_delivery_stops: 0,
        actual_delivery_packages: 0,

        baseline_planned_delivery_stops: 0,
        baseline_actual_delivery_stops: 0,
        supplemental_actual_delivery_stops: 0,

        normalized_route_equivalents: 0,
        planned_route_equivalents: 0,
        executed_route_equivalents: 0,
        supplemental_route_equivalents: 0,

        capacity_pressure_index: null,
        supplemental_volume_share: null,

        routes_below_75_percent_completion: 0,
        routes_above_p90_workload: 0,
      };

    const plannedStops = routeCapacityNumber(
      row.planned_delivery_stops
    );

    const actualStops = routeCapacityNumber(
      row.actual_delivery_stops
    );

    const actualPackages = routeCapacityNumber(
      row.actual_delivery_packages
    );

    const routeEquivalent = routeCapacityNumber(
      row.route_equivalent
    );

    const plannedEquivalent = routeCapacityNumber(
      row.planned_route_equivalent
    );

    const executedEquivalent = routeCapacityNumber(
      row.executed_route_equivalent
    );

    const workloadRatio = routeCapacityNumber(
      row.workload_ratio
    );

    if (
      row.route_class === "BASELINE" ||
      row.route_class === "SUPPLEMENTAL"
    ) {
      current.dispatched_route_count += 1;
    }

    current.planned_delivery_stops += plannedStops;
    current.actual_delivery_stops += actualStops;
    current.actual_delivery_packages += actualPackages;

    if (row.route_class === "BASELINE") {
      current.baseline_route_count += 1;
      current.baseline_planned_delivery_stops += plannedStops;
      current.baseline_actual_delivery_stops += actualStops;

      current.normalized_route_equivalents += routeEquivalent;
      current.planned_route_equivalents += plannedEquivalent;
      current.executed_route_equivalents += executedEquivalent;

      if (row.baseline_band === "LIGHT") {
        current.light_baseline_count += 1;
      } else if (
        row.baseline_band === "HEAVY"
      ) {
        current.heavy_baseline_count += 1;
      } else if (
        row.baseline_band === "EXTREME"
      ) {
        current.extreme_baseline_count += 1;
      } else {
        current.normal_baseline_count += 1;
      }

      const completionRatio =
        row.completion_ratio == null
          ? null
          : routeCapacityNumber(row.completion_ratio);

      if (
        completionRatio != null &&
        completionRatio < 0.75
      ) {
        current.routes_below_75_percent_completion += 1;
      }

      if (workloadRatio >= 1.5) {
        current.routes_above_p90_workload += 1;
      }
    }

    if (row.route_class === "SUPPLEMENTAL") {
      current.supplemental_route_count += 1;
      current.supplemental_actual_delivery_stops += actualStops;
      current.supplemental_route_equivalents += routeEquivalent;
    }

    if (row.route_class === "PICKUP_ONLY") {
      current.pickup_only_route_count += 1;
    }

    if (row.route_class === "EXCLUDED") {
      current.excluded_route_count += 1;
    }

    byDate.set(row.service_date, current);
  }

  return [...byDate.values()]
    .map((day) => {
      const totalCompletedStops =
        day.baseline_actual_delivery_stops +
        day.supplemental_actual_delivery_stops;

      return {
        ...day,

        capacity_pressure_index: nullableRatio(
          day.normalized_route_equivalents,
          day.baseline_route_count
        ),

        supplemental_volume_share: nullableRatio(
          day.supplemental_actual_delivery_stops,
          totalCompletedStops
        ),
      };
    })
    .sort((a, b) =>
      a.service_date.localeCompare(b.service_date)
    );
}
