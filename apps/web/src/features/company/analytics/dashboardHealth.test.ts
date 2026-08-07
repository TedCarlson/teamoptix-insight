import { describe, expect, it } from "vitest";
import type { OperationsHistoryRow } from "./operationsHistory.types";
import { buildDashboardHealth } from "./dashboardHealth";

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function row(
  serviceDate: string,
  input: {
    routes: number;
    stops: number;
    packages: number;
    codes?: number;
    ils?: number;
    pickups?: number;
    early?: number | null;
    late?: number | null;
    missed?: number | null;
  }
) {
  return {
    service_date: serviceDate,
    route_count: input.routes,
    actual_delivery_stops: input.stops,
    actual_delivery_packages: input.packages,
    actual_pickup_stops: input.pickups ?? 60,
    early_pickups: input.early ?? 0,
    late_pickups: input.late ?? 0,
    potential_missed_pickups: input.missed ?? 0,
    pickup_reliability_complete: true,
    code_85: input.codes ?? 0,
    dna: 0,
    send_again: 0,
    ils_percent: input.ils ?? 99,
    ils_impact_packages: input.packages,
  } as OperationsHistoryRow;
}

function tenWeeks(recentPressure: boolean) {
  const rows: OperationsHistoryRow[] = [];
  for (let week = 0; week < 10; week += 1) {
    for (const day of [0, 2, 3, 4, 5, 6]) {
      const recent = week >= 5 && recentPressure;
      rows.push(
        row(addDays("2026-05-23", week * 7 + day), {
          routes: 20,
          stops: recent ? 1_800 : 1_600,
          packages: recent ? 2_700 : 2_400,
          codes: recent ? 18 : 4,
          ils: recent ? 97.5 : 99,
        })
      );
    }
  }
  return rows;
}

const workforce = {
  active_drivers: 25,
  trainees: 1,
  tenure: {
    new_driver_count: 8,
    new_driver_share: 0.32,
  },
};

describe("buildDashboardHealth", () => {
  it("connects demand pressure to route and workforce suggestions", () => {
    const result = buildDashboardHealth(
      tenWeeks(true),
      "2026-08-01",
      workforce,
      { available: true, coverage_days: 20, packages: 400, open_packages: 0 }
    );

    expect(result.recent.deliveryStopsPerRoute).toBe(90);
    expect(result.changes.stopsPerRoute).toBeCloseTo(12.5);
    expect(result.workforce.fiveDayTarget).toBe(27);
    expect(result.workforce.shortfall).toBe(2);
    expect(result.routeComposition.additionalRouteEquivalent).toBe(3);
    expect(result.suggestions.map((item) => item.key)).toEqual(
      expect.arrayContaining(["workforce", "routes", "service", "tenure"])
    );
    expect(result.status).toBe("critical");
  });

  it("keeps a stable, fully staffed composition healthy", () => {
    const result = buildDashboardHealth(
      tenWeeks(false),
      "2026-08-01",
      {
        active_drivers: 27,
        trainees: 0,
        tenure: { new_driver_count: 2, new_driver_share: 0.08 },
      },
      { available: true, coverage_days: 20, packages: 400, open_packages: 0 }
    );

    expect(result.status).toBe("healthy");
    expect(result.workforce.shortfall).toBe(0);
    expect(result.routeComposition.additionalRouteEquivalent).toBe(0);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].key).toBe("maintain");
  });

  it("projects known Active resignations without removing current capacity early", () => {
    const result = buildDashboardHealth(
      tenWeeks(false),
      "2026-08-01",
      {
        active_drivers: 27,
        trainees: 0,
        tenure: { new_driver_count: 2, new_driver_share: 0.08 },
        notice_resignations: [{
          id: "notice-1",
          roster_member_id: "driver-1",
          full_name: "Alex Driver",
          worker_type: "Driver",
          employment_status: "Active",
          notice_date: "2026-08-04",
          last_scheduled_date: "2026-08-14",
          separation_effective_date: "2026-08-15",
          workflow_status: "COUNTDOWN_ACTIVE",
          days_until_last_day: 7,
          days_until_separation: 8,
          route_ready_departure: true,
        }],
      }
    );

    expect(result.workforce.activeDrivers).toBe(27);
    expect(result.workforce.projectedActiveDrivers).toBe(26);
    expect(result.workforce.shortfall).toBe(0);
    expect(result.workforce.projectedShortfall).toBe(1);
    expect(result.suggestions.map((item) => item.key)).toEqual(
      expect.arrayContaining(["off_ramp", "workforce"])
    );
  });

  it("surfaces open Express packages without folding them into DSW math", () => {
    const result = buildDashboardHealth(
      tenWeeks(false),
      "2026-08-01",
      {
        active_drivers: 27,
        trainees: 0,
        tenure: { new_driver_count: 2, new_driver_share: 0.08 },
      },
      { available: true, coverage_days: 20, packages: 400, open_packages: 3 }
    );

    expect(result.status).toBe("critical");
    expect(result.suggestions.find((item) => item.key === "express")?.detail).toContain(
      "3 incomplete Express packages"
    );
  });

  it("keeps an aggregate PRI valid when an included day has no pickup sample", () => {
    const rows = tenWeeks(false);
    rows.at(-1)!.actual_pickup_stops = 0;
    rows.at(-1)!.pickup_reliability_complete = false;

    const result = buildDashboardHealth(
      rows,
      "2026-08-01",
      {
        active_drivers: 27,
        trainees: 0,
        tenure: { new_driver_count: 2, new_driver_share: 0.08 },
      }
    );

    expect(result.recent.pickupReliabilityComplete).toBe(true);
    expect(result.recent.pickupPri).toBe(0);
    expect(result.recent.pickupTier).toBe("T4");
  });

  it("does not publish PRI when the aggregate period has no pickup stops", () => {
    const rows = tenWeeks(false).map((row) => ({
      ...row,
      actual_pickup_stops: 0,
      pickup_reliability_complete: false,
    }));

    const result = buildDashboardHealth(
      rows,
      "2026-08-01",
      {
        active_drivers: 27,
        trainees: 0,
        tenure: { new_driver_count: 2, new_driver_share: 0.08 },
      }
    );

    expect(result.recent.pickupReliabilityComplete).toBe(false);
    expect(result.recent.pickupPri).toBeNull();
    expect(result.recent.pickupTier).toBeNull();
  });

  it("keeps weekday demand independent from structurally lighter weekends", () => {
    const rows: OperationsHistoryRow[] = [];
    for (let week = 0; week < 10; week += 1) {
      const recent = week >= 5;
      rows.push(
        row(addDays("2026-05-23", week * 7), {
          routes: recent ? 2 : 10,
          stops: recent ? 20 : 300,
          packages: recent ? 30 : 450,
          early: recent ? 1 : 0,
        })
      );
      for (const day of [2, 3, 4, 5, 6]) {
        rows.push(
          row(addDays("2026-05-23", week * 7 + day), {
            routes: 20,
            stops: 1_600,
            packages: 2_400,
          })
        );
      }
    }

    const result = buildDashboardHealth(
      rows,
      "2026-08-01",
      {
        active_drivers: 25,
        trainees: 0,
        tenure: { new_driver_count: 2, new_driver_share: 0.08 },
      }
    );

    expect(result.recent.deliveryStopsPerDay).toBe(1_600);
    expect(result.changes.stopsPerDay).toBe(0);
    expect(result.weekend.recent.deliveryStopsPerDay).toBe(20);
    expect(result.weekend.changes.stopsPerDay).toBeCloseTo(-93.333);
    expect(result.recent.pickupTier).toBe("T4");
    expect(result.weekend.recent.pickupTier).toBe("T1");
    expect(result.workforce.fiveDayTarget).toBe(23);
  });

  it("treats null DSW E/L/M exception values as zero", () => {
    const rows = tenWeeks(false);
    rows.at(-1)!.early_pickups = null;
    rows.at(-1)!.late_pickups = null;
    rows.at(-1)!.potential_missed_pickups = null;

    const result = buildDashboardHealth(rows, "2026-08-01", workforce);

    expect(result.recent.earlyPickups).toBe(0);
    expect(result.recent.latePickups).toBe(0);
    expect(result.recent.potentialMissedPickups).toBe(0);
    expect(result.recent.pickupPri).toBe(0);
    expect(result.recent.pickupTier).toBe("T4");
  });

  it("excludes an in-progress current week from completed-week comparisons", () => {
    const rows = tenWeeks(false);
    rows.push(
      row("2026-08-03", {
        routes: 100,
        stops: 10_000,
        packages: 15_000,
      })
    );

    const result = buildDashboardHealth(rows, "2026-08-06", workforce);

    expect(result.recent.end).toBe("2026-07-31");
    expect(result.recent.deliveryStopsPerDay).toBe(1_600);
    expect(result.currentWeek?.weekday.current?.deliveryStopsPerDay).toBe(10_000);
    expect(result.currentWeek?.weekday.weekdays).toEqual([1]);
    expect(result.currentWeek?.days.at(-1)?.current).toBeNull();
    expect(result.currentWeek?.days.at(-1)?.baseline?.deliveryStopsPerDay).toBe(1_600);
    expect(result.currentWeek?.days.at(-1)?.baseline?.pickupTier).toBe("T4");
  });

  it("compares current weekdays only with matching weekdays in the prior five weeks", () => {
    const rows: OperationsHistoryRow[] = [];
    for (let week = 0; week < 5; week += 1) {
      rows.push(row(addDays("2026-06-27", week * 7 + 2), { routes: 10, stops: 1_000, packages: 1_500 }));
      rows.push(row(addDays("2026-06-27", week * 7 + 3), { routes: 20, stops: 2_000, packages: 3_000 }));
      rows.push(row(addDays("2026-06-27", week * 7 + 4), { routes: 20, stops: 2_000, packages: 3_000 }));
      rows.push(row(addDays("2026-06-27", week * 7 + 5), { routes: 20, stops: 2_000, packages: 3_000 }));
      rows.push(row(addDays("2026-06-27", week * 7 + 6), { routes: 20, stops: 2_000, packages: 3_000 }));
    }
    rows.push(row("2026-08-03", { routes: 10, stops: 1_000, packages: 1_500 }));

    const result = buildDashboardHealth(rows, "2026-08-03", workforce);

    expect(result.currentWeek?.weekday.weekdays).toEqual([1]);
    expect(result.currentWeek?.weekday.baseline?.deliveryStopsPerDay).toBe(1_000);
    expect(result.currentWeek?.weekday.changes?.stopsPerDay).toBe(0);
  });
});
