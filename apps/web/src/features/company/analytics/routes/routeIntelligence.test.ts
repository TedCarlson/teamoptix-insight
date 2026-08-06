import { describe, expect, it } from "vitest";
import type { RouteCapacityRow } from "../routeCapacity.types";
import { buildRouteChallengeProfile, buildRouteDriverEvidence, buildRouteProfiles, sortRouteProfiles, summarizeRouteContract } from "./routeIntelligence";
import { deriveRouteCapacityFromHistory } from "./routeIntelligence";
import type { RouteDriverEvidenceFact, ScopedRouteFact } from "../routeCapacity.types";

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

const driverFact = (
  overrides: Partial<RouteDriverEvidenceFact> = {}
): RouteDriverEvidenceFact => ({
  roster_member_id: "driver-1",
  driver_name: "Driver One",
  fx_id: "1234567",
  employment_status: "Active",
  operating_days: 8,
  delivery_stops: 800,
  delivery_packages: 1_200,
  pickup_stops: 40,
  pickup_packages: 50,
  early_pickups: 0,
  late_pickups: 0,
  potential_missed_pickups: 0,
  exceptions: 16,
  code_85: 2,
  dna: 1,
  send_again: 3,
  required_signature: 5,
  miles: 800,
  mileage_days: 8,
  mileage_delivery_stops: 800,
  mileage_delivery_packages: 1_200,
  road_hours: 64,
  road_hour_days: 8,
  road_hour_delivery_stops: 800,
  road_hour_delivery_packages: 1_200,
  duty_hours: 72,
  observed_ils: 98.5,
  first_service_date: "2026-06-01",
  last_service_date: "2026-07-31",
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

  it("uses the Operations PRI convention for route-driver evidence", () => {
    const [driver] = buildRouteDriverEvidence([
      driverFact({ pickup_stops: 1_000, early_pickups: 1 }),
    ]);

    expect(driver).toMatchObject({
      pri: 0.225,
      priTier: "T3",
      averageStops: 100,
      packagesPerStop: 1.5,
      averageRoadHours: 8,
      averageDutyHours: 9,
      stopsPerMile: 1,
      stopsPerRoadHour: 12.5,
      stopsPerDutyHour: 11.11111111111111,
    });
  });

  it("recommends qualified route evidence before a one-day perfect sample", () => {
    const ranked = buildRouteDriverEvidence([
      driverFact({
        roster_member_id: "one-day",
        driver_name: "One Day",
        operating_days: 1,
        pickup_stops: 5,
        exceptions: 0,
      }),
      driverFact({
        roster_member_id: "qualified",
        driver_name: "Qualified",
        operating_days: 5,
        pickup_stops: 25,
        exceptions: 5,
      }),
    ]);

    expect(ranked.map((driver) => driver.rosterMemberId)).toEqual([
      "qualified",
      "one-day",
    ]);
  });

  it("uses lower PRI and then lower exception rate to break qualified ties", () => {
    const ranked = buildRouteDriverEvidence([
      driverFact({
        roster_member_id: "late",
        driver_name: "Late Event",
        pickup_stops: 100,
        late_pickups: 1,
      }),
      driverFact({
        roster_member_id: "clean-high-exceptions",
        driver_name: "Clean High Exceptions",
        exceptions: 30,
      }),
      driverFact({
        roster_member_id: "clean-low-exceptions",
        driver_name: "Clean Low Exceptions",
        exceptions: 5,
      }),
    ]);

    expect(ranked.map((driver) => driver.rosterMemberId)).toEqual([
      "clean-low-exceptions",
      "clean-high-exceptions",
      "late",
    ]);
  });

  it("uses demonstrated duty-hour pace only after reliability and service ties", () => {
    const ranked = buildRouteDriverEvidence([
      driverFact({
        roster_member_id: "slower",
        driver_name: "Slower",
        duty_hours: 100,
      }),
      driverFact({
        roster_member_id: "faster",
        driver_name: "Faster",
        duty_hours: 60,
      }),
    ]);

    expect(ranked.map((driver) => driver.rosterMemberId)).toEqual([
      "faster",
      "slower",
    ]);
  });

  it("does not treat zero-duty evidence as primary driver ownership", () => {
    const ranked = buildRouteDriverEvidence([
      driverFact({ roster_member_id: "helper", duty_hours: 0 }),
      driverFact({ roster_member_id: "driver", driver_name: "Primary Driver" }),
    ]);

    expect(ranked.map((driver) => driver.rosterMemberId)).toEqual(["driver"]);
  });

  it("excludes former roster members from route fit", () => {
    const ranked = buildRouteDriverEvidence([
      driverFact({
        roster_member_id: "former",
        driver_name: "Former Driver",
        employment_status: "Former",
      }),
      driverFact({
        roster_member_id: "active",
        driver_name: "Active Driver",
      }),
    ]);

    expect(ranked.map((driver) => driver.rosterMemberId)).toEqual(["active"]);
  });

  it("uses only denominator-qualified facts for route density and pace", () => {
    expect(buildRouteChallengeProfile({
      operating_days: 10,
      delivery_stops: 1_000,
      delivery_packages: 1_500,
      miles: 800,
      mileage_days: 8,
      mileage_delivery_stops: 800,
      mileage_delivery_packages: 1_200,
      road_hours: 50,
      road_hour_days: 7,
      road_hour_delivery_stops: 700,
      road_hour_delivery_packages: 1_050,
      duty_hours: 100,
    })).toMatchObject({
      stopsPerMile: 1,
      packagesPerMile: 1.5,
      stopsPerRoadHour: 14,
      packagesPerRoadHour: 21,
      stopsPerDutyHour: 10,
      packagesPerDutyHour: 15,
      packagesPerStop: 1.5,
    });
  });

});
