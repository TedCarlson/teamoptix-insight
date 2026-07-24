import { describe, expect, it } from "vitest";
import { classificationChanged, dotWeightClass, federalOvertimeWeightBand } from "./vehicleWeightClassification";

describe("vehicle weight classification", () => {
  it("keeps the 10,000-pound boundary in DOT class 2 and the small-vehicle band", () => {
    expect(dotWeightClass(10_000)).toBe(2);
    expect(federalOvertimeWeightBand(10_000, "VERIFIED")).toBe("SMALL_VEHICLE_10K_OR_LESS");
  });

  it("routes 10,001 pounds to DOT class 3 and over 10K", () => {
    expect(dotWeightClass(10_001)).toBe(3);
    expect(federalOvertimeWeightBand(10_001, "VERIFIED")).toBe("OVER_10K");
  });

  it("fails closed for missing, unverified, and disputed GVWR", () => {
    expect(federalOvertimeWeightBand(null, "VERIFIED")).toBe("UNVERIFIED");
    expect(federalOvertimeWeightBand(9_900, "UNVERIFIED")).toBe("UNVERIFIED");
    expect(federalOvertimeWeightBand(9_900, "DISPUTED")).toBe("UNVERIFIED");
  });

  it("preserves history by recognizing a changed effective classification", () => {
    const current = { gvwr_lbs: 10_000, source_kind: "TITLE", source_reference: "A", verification_status: "VERIFIED" };
    expect(classificationChanged(current, { ...current })).toBe(false);
    expect(classificationChanged(current, { ...current, gvwr_lbs: 10_001 })).toBe(true);
  });
});
