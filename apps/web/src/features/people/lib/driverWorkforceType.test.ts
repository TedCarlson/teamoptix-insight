import { describe, expect, it } from "vitest";
import {
  classifyDriverProgram,
  deriveDriverUtilizationCategory,
  driverUtilizationLabel,
  isDriverRole,
} from "./driverWorkforceType";

describe("driver workforce type", () => {
  it("keeps Driver as the standard program and identifies AVP explicitly", () => {
    expect(classifyDriverProgram("Driver")).toBe("STANDARD");
    expect(classifyDriverProgram("Lead Driver")).toBe("STANDARD");
    expect(classifyDriverProgram("AVP Driver")).toBe("AVP");
  });

  it("derives FT and PT from baseline days and a configurable threshold", () => {
    expect(deriveDriverUtilizationCategory(5, 5)).toBe("FULL_TIME");
    expect(deriveDriverUtilizationCategory(4, 5)).toBe("PART_TIME");
    expect(deriveDriverUtilizationCategory(4, 4)).toBe("FULL_TIME");
    expect(deriveDriverUtilizationCategory(0, 5)).toBe("UNSCHEDULED");
    expect(driverUtilizationLabel("PART_TIME")).toBe("Part-time");
  });

  it("does not infer driver status for non-driver roster roles", () => {
    expect(isDriverRole("Mechanic")).toBe(false);
  });
});
