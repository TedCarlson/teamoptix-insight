import { describe, expect, it } from "vitest";
import type { OperationsHistoryRow } from "../operationsHistory.types";
import { buildWorkforcePlan, calculateWorkforceTarget } from "./workforcePlanning";

function row(serviceDate: string, routes: number): OperationsHistoryRow {
  return { service_date: serviceDate, route_count: routes } as OperationsHistoryRow;
}

describe("buildWorkforcePlan", () => {
  it("uses complete Saturday-Friday weeks and sustained daily demand", () => {
    const rows: OperationsHistoryRow[] = [];
    for (let week = 0; week < 6; week += 1) {
      for (let day = 0; day < 6; day += 1) {
        const date = new Date("2026-06-20T00:00:00Z");
        date.setUTCDate(date.getUTCDate() + week * 7 + day);
        rows.push(row(date.toISOString().slice(0, 10), 20 + week));
      }
    }
    rows.push(row("2026-08-01", 99));

    const plan = buildWorkforcePlan(rows, "2026-08-06", 29, []);

    expect(plan.recentWindowStart).toBe("2026-06-27");
    expect(plan.recentWindowEnd).toBe("2026-07-31");
    expect(plan.recentPlanningRoutesPerDay).toBe(23);
    expect(plan.observedOperatingDaysPerWeek).toBe(6);
    expect(plan.scenarios[0].target).toBe(32);
    expect(plan.scenarios[0].status).toBe("light");
    expect(plan.peakPlanningRoutesPerDay).toBe(23);
    expect(plan.peakMaximumRoutesPerDay).toBe(25);
    expect(plan.scenarios[2].targetLow).toBe(31);
    expect(plan.scenarios[2].targetHigh).toBe(33);
    expect(plan.scenarios[2].target).toBe(33);
    expect(plan.scenarios[2].driverDays).toBe(6);
    expect(plan.scenarios[2].status).toBe("light");
  });

  it("uses scheduled absences as an observed availability factor", () => {
    const rows = ["2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30"]
      .map((date) => row(date, 20));
    const plan = buildWorkforcePlan(rows, "2026-07-31", 24, [{
      scheduled_assignments: 100,
      scheduled_days: 6,
      call_outs: 4,
      no_shows: 1,
      approved_time_off_days: 5,
    }]);

    expect(plan.availability).toBe(0.9);
    expect(plan.availabilityKnown).toBe(true);
    expect(plan.coverageFactor).toBe(1.125);
    expect(plan.evidenceCoverageFactor).toBeCloseTo(1.111, 3);
    expect(plan.scenarios[0].target).toBe(27);
    expect(plan.scenarios[0].evidenceTarget).toBe(27);
  });

  it("produces the 30 and 25 driver defaults for 22 routes over six days", () => {
    const rows = ["2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30"]
      .map((date) => row(date, 22));
    const plan = buildWorkforcePlan(rows, "2026-07-31", 29, []);

    expect(plan.scenarios[0].target).toBe(30);
    expect(plan.scenarios[1].target).toBe(25);
    expect(plan.scenarios[0].evidenceTarget).toBeNull();
    expect(plan.scenarios[0].readinessPercent).toBeCloseTo(96.67, 2);
  });

  it("plans Peak from the sustained average through the observed maximum on six driver days", () => {
    expect(calculateWorkforceTarget(24.6, 7, 6, 1.125)).toBe(33);
    expect(calculateWorkforceTarget(32, 7, 6, 1.125)).toBe(42);
  });

  it("keeps current headcount visible while planning against known notice departures", () => {
    const rows = ["2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30"]
      .map((date) => row(date, 22));
    const plan = buildWorkforcePlan(rows, "2026-07-31", 30, [], 1);

    expect(plan.scenarios[0].current).toBe(30);
    expect(plan.scenarios[0].projectedCurrent).toBe(29);
    expect(plan.scenarios[0].noticeDepartures).toBe(1);
    expect(plan.scenarios[0].delta).toBe(-1);
    expect(plan.scenarios[0].status).toBe("light");
  });
});
