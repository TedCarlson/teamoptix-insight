import { describe, expect, it } from "vitest";
import {
  pickupContribution,
  privatePublicationIdentity,
  standardLabel,
  warehouseCoverage,
} from "./driverScorecard";
import type {
  DriverPeriodSummary,
  ScorecardMetric,
} from "./driverScorecard.types";

const period = (
  overrides: Partial<DriverPeriodSummary> = {},
): DriverPeriodSummary => ({
  operating_days: 10,
  route_days: 10,
  delivery_stops: 1000,
  delivery_packages: 1500,
  pickup_stops: 50,
  pickup_packages: 100,
  early_pickups: 0,
  late_pickups: 0,
  potential_missed_pickups: 0,
  exceptions: 0,
  code_85: 0,
  dna: 0,
  send_again: 0,
  required_signature: 0,
  miles: 500,
  road_hours: 80,
  duty_hours: 90,
  observed_ils: null,
  ...overrides,
});

const pickupMetric = {
  metric_key: "PICKUPS",
  display_name: "Pickups",
  category_key: "SERVICE",
  contribution_weight: 18,
  scoring_method: "BINARY_ZERO",
  target_primary: 0,
  target_secondary: null,
  target_tertiary: null,
  points_primary: 10,
  points_secondary: null,
  points_tertiary: null,
  source_mode: "WAREHOUSE",
  enabled: true,
  sort_order: 70,
} satisfies ScorecardMetric;

describe("driver scorecard warehouse foundation", () => {
  it("awards the seeded pickup contribution only with a clean observed sample", () => {
    expect(pickupContribution(period(), pickupMetric)).toEqual({
      status: "SCORED",
      points: 10,
      contribution: 18,
    });
    expect(
      pickupContribution(period({ late_pickups: 1 }), pickupMetric)
        .contribution,
    ).toBe(0);
  });

  it("does not score provisional missed pickups", () => {
    expect(
      pickupContribution(period({ potential_missed_pickups: 1 }), pickupMetric)
        .status,
    ).toBe("UNDER_REVIEW");
  });

  it("reports only genuinely connected score weight", () => {
    expect(
      warehouseCoverage([
        pickupMetric,
        {
          ...pickupMetric,
          metric_key: "PPOD",
          contribution_weight: 6,
          source_mode: "FEDEX_IMPORT",
        },
      ]),
    ).toBe(18);
  });

  it("publishes names for the top five and FX IDs for everyone else", () => {
    const driver = { full_name: "A Driver", fx_id: "1234567" };
    expect(privatePublicationIdentity(driver, 5)).toBe("A Driver");
    expect(privatePublicationIdentity(driver, 6)).toBe("1234567");
  });

  it("turns seeded rules into plain-language contribution standards", () => {
    expect(standardLabel(pickupMetric)).toBe("0 confirmed failures");
    expect(
      standardLabel({
        ...pickupMetric,
        metric_key: "PPOD",
        scoring_method: "BAND",
        target_primary: 97,
        target_secondary: 95,
        target_tertiary: 90,
        points_secondary: 5,
        points_tertiary: 3,
      }),
    ).toBe("Full ≥ 97% (10 pts) · Mid ≥ 95% (5 pts) · Base ≥ 90% (3 pts)");
  });
});
