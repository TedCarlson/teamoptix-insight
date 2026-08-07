import { describe, expect, it } from "vitest";
import {
  expressTimeFrameSortKey,
  routeWorkAreaLabel,
} from "./expressReport.presentation";

describe("Express report presentation", () => {
  it("places the 00:00–00:00 bucket after promised windows", () => {
    const windows = [
      { begin: "00:00", end: "00:00" },
      { begin: "14:00", end: "16:30" },
      { begin: "10:30", end: "12:00" },
    ].sort((a, b) =>
      expressTimeFrameSortKey(a.begin, a.end).localeCompare(
        expressTimeFrameSortKey(b.begin, b.end)
      )
    );

    expect(windows.at(-1)).toEqual({ begin: "00:00", end: "00:00" });
  });

  it("orders promised windows by close time, not start time", () => {
    const windows = [
      { begin: "02:00", end: "16:00" },
      { begin: "14:00", end: "15:00" },
      { begin: "10:00", end: "12:00" },
      { begin: "0:00", end: "0:00" },
    ].sort((a, b) =>
      expressTimeFrameSortKey(a.begin, a.end).localeCompare(
        expressTimeFrameSortKey(b.begin, b.end)
      )
    );

    expect(windows).toEqual([
      { begin: "10:00", end: "12:00" },
      { begin: "14:00", end: "15:00" },
      { begin: "02:00", end: "16:00" },
      { begin: "0:00", end: "0:00" },
    ]);
  });

  it("treats FedEx 02:00–04:00 as an afternoon window closing at 4 PM", () => {
    const windows = [
      { begin: "00:00", end: "17:00" },
      { begin: "02:00", end: "04:00" },
      { begin: "00:00", end: "13:30" },
      { begin: "00:00", end: "12:00" },
      { begin: "00:00", end: "00:00" },
    ].sort((a, b) =>
      expressTimeFrameSortKey(a.begin, a.end).localeCompare(
        expressTimeFrameSortKey(b.begin, b.end)
      )
    );

    expect(windows).toEqual([
      { begin: "00:00", end: "12:00" },
      { begin: "00:00", end: "13:30" },
      { begin: "02:00", end: "04:00" },
      { begin: "00:00", end: "17:00" },
      { begin: "00:00", end: "00:00" },
    ]);
  });

  it("never renders an internal Available hash as a work area", () => {
    expect(
      routeWorkAreaLabel("BPV 17 - Available_HASH_47eb3203", "BPV 17")
    ).toBe("BPV 17");
    expect(routeWorkAreaLabel("Available_HASH_47eb3203", "BPV 17")).toBe(
      "BPV 17"
    );
    expect(routeWorkAreaLabel(null, "Available_HASH_47eb3203")).toBe(
      "Work area unavailable"
    );
  });
});
