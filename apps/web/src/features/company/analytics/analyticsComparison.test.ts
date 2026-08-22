import { describe, expect, it } from "vitest";
import type { OperationsHistoryRow } from "./operationsHistory.types";
import { buildAnalyticsComparisonBrief } from "./analyticsComparison";

function row({
  date,
  routes,
  stops,
  packages,
  codes = 0,
  ils = 99,
}: {
  date: string;
  routes: number;
  stops: number;
  packages: number;
  codes?: number;
  ils?: number;
}): OperationsHistoryRow {
  return {
    service_date: date,
    route_count: routes,
    total_stops: stops,
    total_packages: packages,
    actual_delivery_packages: packages,
    code_85: codes,
    dna: 0,
    send_again: 0,
    ils_percent: ils,
    ils_impact_packages: packages,
  } as OperationsHistoryRow;
}

describe("analytics comparison brief", () => {
  it("normalizes periods with different operating-day counts", () => {
    const current = [
      row({ date: "2026-08-01", routes: 20, stops: 2_000, packages: 3_000 }),
      row({ date: "2026-08-02", routes: 20, stops: 2_000, packages: 3_000 }),
      row({ date: "2026-08-03", routes: 20, stops: 2_000, packages: 3_000 }),
    ];
    const comparison = [
      row({ date: "2026-07-01", routes: 18, stops: 1_800, packages: 2_700 }),
      row({ date: "2026-07-02", routes: 18, stops: 1_800, packages: 2_700 }),
      row({ date: "2026-07-03", routes: 18, stops: 1_800, packages: 2_700 }),
      row({ date: "2026-07-04", routes: 18, stops: 1_800, packages: 2_700 }),
      row({ date: "2026-07-05", routes: 18, stops: 1_800, packages: 2_700 }),
    ];

    const brief = buildAnalyticsComparisonBrief(current, comparison);

    expect(brief?.coverage).toBe("limited");
    expect(brief?.metrics[0]).toMatchObject({
      current: 2_000,
      comparison: 1_800,
    });
    expect(brief?.metrics[0].delta).toBeCloseTo(11.11, 1);
  });

  it("refuses to claim a trend when coverage is severely uneven", () => {
    const current = Array.from({ length: 20 }, (_, index) =>
      row({
        date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        routes: 20,
        stops: 2_000,
        packages: 3_000,
      })
    );
    const comparison = [
      row({ date: "2025-08-16", routes: 18, stops: 1_800, packages: 2_700 }),
      row({ date: "2025-08-17", routes: 18, stops: 1_800, packages: 2_700 }),
    ];

    const brief = buildAnalyticsComparisonBrief(current, comparison);

    expect(brief?.coverage).toBe("insufficient");
    expect(brief?.headline).toBe("More comparable history is required.");
  });

  it("treats lower service-code pressure and stronger ILS as improvement", () => {
    const current = [
      row({ date: "2026-08-01", routes: 20, stops: 2_000, packages: 1_000, codes: 10, ils: 99 }),
      row({ date: "2026-08-02", routes: 20, stops: 2_000, packages: 1_000, codes: 10, ils: 99 }),
      row({ date: "2026-08-03", routes: 20, stops: 2_000, packages: 1_000, codes: 10, ils: 99 }),
    ];
    const comparison = [
      row({ date: "2026-07-01", routes: 20, stops: 2_000, packages: 1_000, codes: 20, ils: 98 }),
      row({ date: "2026-07-02", routes: 20, stops: 2_000, packages: 1_000, codes: 20, ils: 98 }),
      row({ date: "2026-07-03", routes: 20, stops: 2_000, packages: 1_000, codes: 20, ils: 98 }),
    ];

    const brief = buildAnalyticsComparisonBrief(current, comparison);
    const service = brief?.metrics.find((metric) => metric.key === "service_codes");
    const ils = brief?.metrics.find((metric) => metric.key === "ils");

    expect(service).toMatchObject({ delta: -50, tone: "positive" });
    expect(ils).toMatchObject({ delta: 1, tone: "positive" });
    expect(brief?.headline).toBe("Service improved versus the comparison period.");
  });
});
