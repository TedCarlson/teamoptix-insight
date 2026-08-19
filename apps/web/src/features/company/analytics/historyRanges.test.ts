import { describe, expect, it } from "vitest";
import { buildMonthRanges } from "./historyRanges";

describe("buildMonthRanges", () => {
  it("keeps an open contract longer than a year inside monthly RPC limits", () => {
    const ranges = buildMonthRanges("2025-08-16", "2026-08-18");

    expect(ranges).toHaveLength(13);
    expect(ranges[0]).toEqual({
      start_date: "2025-08-16",
      end_date: "2025-08-31",
    });
    expect(ranges.at(-1)).toEqual({
      start_date: "2026-08-01",
      end_date: "2026-08-18",
    });

    for (const range of ranges) {
      const elapsedDays = (
        Date.parse(`${range.end_date}T12:00:00Z`) -
        Date.parse(`${range.start_date}T12:00:00Z`)
      ) / 86_400_000;
      expect(elapsedDays).toBeLessThanOrEqual(30);
    }
  });
});
