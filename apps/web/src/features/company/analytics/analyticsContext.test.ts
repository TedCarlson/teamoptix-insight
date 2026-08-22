import { describe, expect, it } from "vitest";
import {
  buildAnalyticsCalendarSegments,
  resolveAnalyticsContext,
  type AnalyticsContractPeriod,
} from "./analyticsContext";

const multiYearContract: AnalyticsContractPeriod = {
  id: "11111111-1111-4111-8111-111111111111",
  contract_number: "C8887538",
  terminal_identity: "AUGUSTA",
  service_area: "BPV",
  effective_start_date: "2025-08-16",
  effective_end_date: "2028-08-15",
  status: "ACTIVE",
};

describe("analytics context", () => {
  it("splits one multi-year contract into calendar-year segments", () => {
    expect(
      buildAnalyticsCalendarSegments(
        [multiYearContract],
        "2028-12-31"
      ).map((segment) => ({
        year: segment.calendar_year,
        start: segment.segment_start_date,
        end: segment.segment_end_date,
      }))
    ).toEqual([
      { year: 2025, start: "2025-08-16", end: "2025-12-31" },
      { year: 2026, start: "2026-01-01", end: "2026-12-31" },
      { year: 2027, start: "2027-01-01", end: "2027-12-31" },
      { year: 2028, start: "2028-01-01", end: "2028-08-15" },
    ]);
  });

  it("resolves Q4 against Q3 as a previous-period comparison", () => {
    const fullYearContract = {
      ...multiYearContract,
      effective_start_date: "2025-01-01",
    };

    expect(
      resolveAnalyticsContext({
        calendarYear: 2025,
        preset: "q4",
        comparisonMode: "previous_period",
        contractId: fullYearContract.id,
        contracts: [fullYearContract],
        today: "2026-08-22",
      })
    ).toMatchObject({
      primary: {
        start_date: "2025-10-01",
        end_date: "2025-12-31",
      },
      comparison: {
        start_date: "2025-07-01",
        end_date: "2025-09-30",
      },
    });
  });

  it("aligns an elapsed calendar year with the prior year", () => {
    expect(
      resolveAnalyticsContext({
        calendarYear: 2026,
        preset: "calendar_year",
        comparisonMode: "prior_year",
        contractId: multiYearContract.id,
        contracts: [multiYearContract],
        today: "2026-08-22",
      })
    ).toMatchObject({
      primary: {
        start_date: "2026-01-01",
        end_date: "2026-08-22",
      },
      comparison: {
        start_date: "2025-08-16",
        end_date: "2025-08-22",
      },
    });
  });

  it("keeps trailing presets inside the selected calendar year", () => {
    expect(
      resolveAnalyticsContext({
        calendarYear: 2026,
        preset: "last_90_days",
        comparisonMode: "none",
        contractId: multiYearContract.id,
        contracts: [multiYearContract],
        today: "2026-08-22",
      })?.primary
    ).toEqual({
      start_date: "2026-05-25",
      end_date: "2026-08-22",
    });
  });

  it("anchors the previous quarter before contract clipping", () => {
    const result = resolveAnalyticsContext({
      calendarYear: 2025,
      preset: "q3",
      comparisonMode: "previous_period",
      contractId: multiYearContract.id,
      contracts: [multiYearContract],
      today: "2026-08-22",
    });

    expect(result?.primary).toEqual({
      start_date: "2025-08-16",
      end_date: "2025-09-30",
    });
    expect(result?.comparison).toBeNull();
  });

  it("keeps duplicate contract numbers distinct by UUID", () => {
    const renewed = {
      ...multiYearContract,
      id: "22222222-2222-4222-8222-222222222222",
      effective_start_date: "2026-07-01",
      effective_end_date: "2026-12-31",
    };

    const segments = buildAnalyticsCalendarSegments(
      [multiYearContract, renewed],
      "2026-12-31"
    ).filter((segment) => segment.calendar_year === 2026);

    expect(segments.map((segment) => segment.id)).toEqual([
      multiYearContract.id,
      renewed.id,
    ]);
  });
});
