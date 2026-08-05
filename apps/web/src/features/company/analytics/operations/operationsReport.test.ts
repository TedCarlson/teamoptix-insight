import { describe, expect, it } from "vitest";
import type { OperationsHistoryRow } from "../operationsHistory.types";
import { buildOperationsReport } from "./operationsReport";

function historyRow(
  serviceDate: string,
  overrides: Partial<OperationsHistoryRow> = {}
): OperationsHistoryRow {
  return {
    service_date: serviceDate,
    route_count: 1,
    total_stops: 100,
    total_packages: 150,
    actual_pickup_stops: 1_000,
    early_pickups: 0,
    late_pickups: 0,
    potential_missed_pickups: 0,
    pickup_reliability_complete: true,
    ...overrides,
  } as OperationsHistoryRow;
}

describe("buildOperationsReport PRI", () => {
  it("calculates weekly and contract-running PRI in chronological order", () => {
    const report = buildOperationsReport([
      historyRow("2026-08-01", {
        early_pickups: 1,
        late_pickups: 2,
        potential_missed_pickups: 1,
      }),
      historyRow("2026-08-08", {
        late_pickups: 1,
      }),
    ]);

    expect(report.weeks).toHaveLength(2);
    expect(report.weeks[0]).toMatchObject({
      weekStart: "2026-08-01",
      isInProgress: false,
      weeklyPri: 0.925,
      runningPri: 0.925,
      runningTier: "T2",
    });
    expect(report.weeks[1]).toMatchObject({
      weekStart: "2026-08-08",
      isInProgress: true,
      weeklyPri: 0.15,
      runningPri: 0.5375,
      runningTier: "T3",
    });
  });

  it("does not publish a running PRI across an incomplete historical week", () => {
    const report = buildOperationsReport([
      historyRow("2026-08-01", {
        pickup_reliability_complete: false,
      }),
      historyRow("2026-08-08", {
        late_pickups: 1,
      }),
    ]);

    expect(report.weeks[0].weeklyPri).toBeNull();
    expect(report.weeks[0].runningPri).toBeNull();
    expect(report.weeks[1].weeklyPri).toBe(0.15);
    expect(report.weeks[1].runningPri).toBeNull();
    expect(report.weeks[1].runningTier).toBeNull();
  });
});
