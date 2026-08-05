import { describe, expect, it } from "vitest";
import { buildTerritoryModel, type TerritoryRow } from "./territoryIntelligence";

function row(overrides: Partial<TerritoryRow>): TerritoryRow {
  return {
    zip_code: "16063",
    preferred_city: "Zelienople",
    state_code: "PA",
    classification: "STANDARD",
    population: 1000,
    land_area_sqmi: 10,
    population_density_per_sqmi: 100,
    business_establishments: 40,
    business_employment: 200,
    establishments_per_sqmi: 4,
    employees_per_sqmi: 20,
    ruca_primary_code: 1,
    ruca_secondary_code: 1,
    ruca_category: "METROPOLITAN",
    rurality_factor: 0,
    latitude: 40.8,
    longitude: -80.1,
    coordinate_source: "HUD",
    coordinate_method: "POPULATION_WEIGHTED_RESIDENTIAL",
    first_seen: "2026-07-01",
    last_seen: "2026-07-31",
    operating_days: 10,
    routes_observed: 2,
    delivery_stops: 100,
    delivery_packages: 150,
    pickup_stops: 10,
    pickup_packages_expected: 20,
    pickup_packages_actual: 18,
    reference_matched: true,
    terminal_distance_miles: 12,
    ...overrides,
  };
}

describe("territory intelligence model", () => {
  it("weights distance and rurality by observed stop workload", () => {
    const model = buildTerritoryModel([
      row({ delivery_stops: 90, pickup_stops: 10, terminal_distance_miles: 10 }),
      row({ zip_code: "16101", delivery_stops: 10, pickup_stops: 0, terminal_distance_miles: 50, rurality_factor: 1, ruca_category: "RURAL" }),
    ]);

    expect(model.weightedDistance).toBeCloseTo(13.636, 2);
    expect(model.workloadRurality).toBeCloseTo(0.0909, 3);
    expect(model.composition.find((band) => band.key === "METROPOLITAN")?.workloadShare).toBeCloseTo(0.909, 3);
  });

  it("keeps observed ZIP expansion chronological", () => {
    const model = buildTerritoryModel([
      row({ zip_code: "16101", first_seen: "2026-08-01" }),
      row({ zip_code: "16063", first_seen: "2026-07-01" }),
    ]);
    expect(model.expansion.map((item) => item.month)).toEqual(["2026-07", "2026-08"]);
  });

  it("moves a distant immaterial ZIP into geographic exceptions", () => {
    const model = buildTerritoryModel([
      row({ zip_code: "29801", latitude: 33.56, longitude: -81.72, delivery_stops: 14000 }),
      row({ zip_code: "29803", latitude: 33.48, longitude: -81.70, delivery_stops: 3500 }),
      row({ zip_code: "68164", latitude: 41.30, longitude: -96.05, delivery_stops: 1 }),
    ]);

    expect(model.rows.map((item) => item.zip_code)).not.toContain("68164");
    expect(model.outlierRows.map((item) => item.row.zip_code)).toEqual(["68164"]);
  });

  it("retains a distant ZIP when its workload is material", () => {
    const model = buildTerritoryModel([
      row({ zip_code: "29801", latitude: 33.56, longitude: -81.72, delivery_stops: 1000 }),
      row({ zip_code: "29803", latitude: 33.48, longitude: -81.70, delivery_stops: 1000 }),
      row({ zip_code: "68164", latitude: 41.30, longitude: -96.05, delivery_stops: 100 }),
    ]);

    expect(model.outlierRows).toHaveLength(0);
    expect(model.rows.map((item) => item.zip_code)).toContain("68164");
  });
});
