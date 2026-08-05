import { describe, expect, it } from "vitest";
import type { RouteCapacityRow } from "../routeCapacity.types";
import { buildRouteProfiles, sortRouteProfiles, summarizeRouteContract } from "./routeIntelligence";
import { deriveRouteCapacityFromHistory } from "./routeIntelligence";
import type { ScopedRouteFact } from "../routeCapacity.types";

const row = (overrides: Partial<RouteCapacityRow> = {}): RouteCapacityRow => ({
  service_date: "2026-07-01",
  weekday_number: 3,
  route_key: "WA:100",
  route_baseline_id: "baseline-1",
  route_name: "R100",
  wa_number: "100",
  driver_name: "Driver",
  planned_delivery_stops: 100,
  actual_delivery_stops: 90,
  actual_delivery_packages: 140,
  planned_pickup_stops: 3,
  actual_pickup_stops: 2,
  actual_pickup_packages: 3,
  classification_workload_stops: 100,
  historical_sample_size: 14,
  historical_median_stops: 80,
  historical_p10_stops: 60,
  historical_p25_stops: 70,
  historical_p75_stops: 95,
  historical_p90_stops: 110,
  effective_threshold_stops: 32,
  threshold_basis: "ROUTE_WEEKDAY",
  confidence_level: "HIGH",
  workload_ratio: 1.25,
  planned_workload_ratio: 1.25,
  executed_workload_ratio: 1.125,
  route_equivalent: 1.25,
  planned_route_equivalent: 1.25,
  executed_route_equivalent: 1.125,
  completion_ratio: 0.9,
  route_class: "BASELINE",
  baseline_band: "NORMAL",
  ...overrides,
});

describe("route intelligence model", () => {
  it("keeps route-day averages separate from contract totals", () => {
    const profile = buildRouteProfiles([
      row({ actual_delivery_stops: 80, actual_delivery_packages: 120 }),
      row({ service_date: "2026-07-02", actual_delivery_stops: 120, actual_delivery_packages: 180 }),
    ])[0];
    expect(profile.actualStops).toBe(200);
    expect(profile.averageStops).toBe(100);
    expect(profile.packagesPerStop).toBe(1.5);
  });

  it("separates baseline and supplemental route-days in the contract summary", () => {
    const rows = [row(), row({ service_date: "2026-07-02", route_class: "SUPPLEMENTAL", baseline_band: null })];
    expect(summarizeRouteContract(rows)).toMatchObject({
      logicalRoutes: 1,
      routeDays: 2,
      baselineRouteDays: 1,
      supplementalRouteDays: 1,
    });
  });

  it("ranks heavy and extreme routes first in workload mode", () => {
    const profiles = buildRouteProfiles([
      row({ route_key: "normal", baseline_band: "NORMAL" }),
      row({ route_key: "heavy", route_name: "Heavy", baseline_band: "EXTREME", workload_ratio: 1.7 }),
    ]);
    expect(sortRouteProfiles(profiles, "workload")[0]?.key).toBe("heavy");
  });

  it("derives route facts from the shared daily contract payload", () => {
    const facts = Array.from({ length: 8 }, (_, index) => ({
      service_date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      weekday_number: 3,
      route_baseline_id: "baseline-1",
      route_name: "R100",
      wa_number: "100",
      driver_name: "Driver",
      planned_delivery_stops: 100,
      actual_delivery_stops: index === 7 ? 150 : 100,
      actual_delivery_packages: 160,
      planned_pickup_stops: 2,
      actual_pickup_stops: 2,
      actual_pickup_packages: 2,
    })) as ScopedRouteFact[];

    const derived = deriveRouteCapacityFromHistory(facts);
    expect(derived).toHaveLength(8);
    expect(derived[7]).toMatchObject({
      route_key: "BASELINE:baseline-1",
      threshold_basis: "ROUTE_WEEKDAY",
      confidence_level: "MODERATE",
      workload_ratio: 1.5,
      baseline_band: "HEAVY",
    });
  });
});
