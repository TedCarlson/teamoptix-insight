import { describe, expect, it } from "vitest";
import { peakPlanningFilename } from "./PeakPlanningSurface";

describe("peakPlanningFilename", () => {
  it("uses the company name and export date", () => {
    expect(peakPlanningFilename("beacon-point-ventures", new Date(2026, 7, 7)))
      .toBe("Peak-Planning_Beacon-Point-Ventures_2026-08-07");
  });
});
