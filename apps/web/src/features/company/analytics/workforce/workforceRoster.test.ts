import { describe, expect, it } from "vitest";
import { activeRosterHeadcount } from "./workforceRoster";

describe("activeRosterHeadcount", () => {
  it("does not count trainees as active roster workforce", () => {
    expect(activeRosterHeadcount({ active: 12, trainees: 3 })).toBe(12);
  });

  it("defaults a missing active count to zero", () => {
    expect(activeRosterHeadcount({ trainees: 3 })).toBe(0);
  });
});
