import { describe, expect, it } from "vitest";
import { buildWorkforceTenureProfile } from "./workforceTenure";

describe("buildWorkforceTenureProfile", () => {
  it("places active drivers into non-overlapping tenure bands", () => {
    const profile = buildWorkforceTenureProfile([
      { employment_status: "Active", hire_date: "2026-07-20" },
      { employment_status: "Active", hire_date: "2026-06-01" },
      { employment_status: "Active", hire_date: "2026-03-01" },
      { employment_status: "Active", hire_date: "2025-10-01" },
      { employment_status: "Active", hire_date: "2024-07-01" },
      { employment_status: "Trainee", hire_date: "2026-08-01" },
      { employment_status: "Active", hire_date: null },
    ], "2026-08-07");

    expect(profile.active_drivers).toBe(6);
    expect(profile.known_tenure).toBe(5);
    expect(profile.missing_hire_date).toBe(1);
    expect(profile.segments.map((segment) => segment.count)).toEqual([1, 1, 1, 1, 1]);
    expect(profile.new_driver_count).toBe(2);
    expect(profile.new_driver_share).toBe(0.4);
  });
});
