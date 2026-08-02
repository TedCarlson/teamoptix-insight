import { describe, expect, it } from "vitest";
import { annualizeCompensation } from "./compensationModel";

describe("annualizeCompensation", () => {
  it("models hourly earnings across 52 weeks", () => {
    expect(
      annualizeCompensation({ basis: "HOURLY", rate: 20, hoursPerWeek: 40 }),
    ).toBe(41_600);
  });

  it("models daily earnings across 52 weeks", () => {
    expect(
      annualizeCompensation({ basis: "DAILY", rate: 150, daysPerWeek: 5 }),
    ).toBe(39_000);
  });

  it("models weekly earnings across 52 weeks", () => {
    expect(annualizeCompensation({ basis: "WEEKLY", rate: 1_000 })).toBe(
      52_000,
    );
  });
});
