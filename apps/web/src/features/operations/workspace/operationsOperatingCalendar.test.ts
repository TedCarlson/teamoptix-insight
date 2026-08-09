import { describe, expect, it } from "vitest";
import { resolveOperatingDateDecision } from "./operationsOperatingCalendar";

describe("resolveOperatingDateDecision", () => {
  it("pauses a Sunday excluded by the weekly calendar", () => {
    expect(
      resolveOperatingDateDecision({
        operationalDate: "2026-08-09",
        dayOfWeek: 0,
        operatingWeekdays: [1, 2, 3, 4, 5, 6],
        operatingDateOverrides: {},
      })
    ).toEqual({ operates: false, source: "weekly_calendar", override: null });
  });

  it("opens an excluded day with a supplemental operating override", () => {
    expect(
      resolveOperatingDateDecision({
        operationalDate: "2026-08-09",
        dayOfWeek: 0,
        operatingWeekdays: [1, 2, 3, 4, 5, 6],
        operatingDateOverrides: { "2026-08-09": "OPERATING" },
      })
    ).toEqual({
      operates: true,
      source: "dated_override",
      override: "OPERATING",
    });
  });

  it("lets a dated closure override a normal operating weekday", () => {
    expect(
      resolveOperatingDateDecision({
        operationalDate: "2026-08-10",
        dayOfWeek: 1,
        operatingWeekdays: [1, 2, 3, 4, 5, 6],
        operatingDateOverrides: { "2026-08-10": "CLOSED" },
      })
    ).toEqual({
      operates: false,
      source: "dated_override",
      override: "CLOSED",
    });
  });
});
