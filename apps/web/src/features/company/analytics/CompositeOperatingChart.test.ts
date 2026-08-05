import { describe, expect, it } from "vitest";
import { aggregateStopsPerRoute } from "./CompositeOperatingChart";

describe("aggregateStopsPerRoute", () => {
  it("dilutes an aggregate stop total across every route-day in the range", () => {
    const averageRoutesPerDay = 28.2;
    const operatingDays = 25;
    const totalRouteDays = averageRoutesPerDay * operatingDays;

    expect(aggregateStopsPerRoute(39_521, totalRouteDays)).toBeCloseTo(56.1, 1);
  });

  it("uses the summed weekly route count for a weekly aggregate", () => {
    expect(aggregateStopsPerRoute(8_905, 131)).toBeCloseTo(68.0, 1);
  });

  it("does not publish an infinite average without route-days", () => {
    expect(aggregateStopsPerRoute(1_000, 0)).toBe(0);
  });
});
