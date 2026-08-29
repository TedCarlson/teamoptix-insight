import { describe, expect, it } from "vitest";
import { measureDriverUtilization } from "./driverUtilization";

describe("measureDriverUtilization", () => {
  it("weights part-time drivers without granting full-position readiness", () => {
    const measure = measureDriverUtilization([
      {
        worker_type: "Driver",
        employment_status: "Active",
        driver_utilization_category: "FULL_TIME",
        route_utilization_ratio: 1,
      },
      {
        worker_type: "Driver",
        employment_status: "Active",
        driver_utilization_category: "PART_TIME",
        route_utilization_ratio: 0.8,
      },
      {
        worker_type: "AVP Driver",
        employment_status: "Active",
        driver_utilization_category: "PART_TIME",
        route_utilization_ratio: 0.2,
      },
      {
        worker_type: "Manager",
        employment_status: "Active",
      },
    ]);

    expect(measure).toEqual({
      driverPositions: 3,
      fullTime: 1,
      partTime: 2,
      avp: 1,
      unscheduled: 0,
      routeDayEquivalents: 2,
      utilizationPercent: 67,
    });
  });

  it("derives a missing ratio from scheduled days and exposes schedule seams", () => {
    const measure = measureDriverUtilization([
      {
        worker_type: "Driver",
        employment_status: "Active",
        scheduled_days_per_week: 4,
        driver_full_time_day_threshold: 5,
      },
      {
        worker_type: "Driver",
        employment_status: "Active",
        scheduled_days_per_week: null,
        driver_full_time_day_threshold: 5,
      },
    ]);

    expect(measure.partTime).toBe(1);
    expect(measure.unscheduled).toBe(1);
    expect(measure.routeDayEquivalents).toBe(0.8);
    expect(measure.utilizationPercent).toBe(40);
  });
});
