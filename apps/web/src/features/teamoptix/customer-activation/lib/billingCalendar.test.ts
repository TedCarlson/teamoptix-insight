import { describe, expect, it } from "vitest";

import {
  calculateFirstFridayAfterGoLive,
  newYorkBillingDateToStripeAnchor,
} from "./billingCalendar";

describe("Team Optix weekly billing calendar", () => {
  it.each([
    ["2026-08-03T16:00:00.000Z", "2026-08-07"],
    ["2026-08-07T16:00:00.000Z", "2026-08-14"],
    ["2026-08-09T16:00:00.000Z", "2026-08-14"],
    ["2026-12-31T16:00:00.000Z", "2027-01-01"],
  ])("maps Go Live at %s to %s", (goLive, expected) => {
    expect(calculateFirstFridayAfterGoLive(new Date(goLive))).toBe(expected);
  });

  it("converts a pre-DST Friday to New York midnight", () => {
    expect(newYorkBillingDateToStripeAnchor("2026-03-06")).toBe(
      Date.UTC(2026, 2, 6, 5, 0, 0) / 1000
    );
  });

  it("converts a post-DST Friday to New York midnight", () => {
    expect(newYorkBillingDateToStripeAnchor("2026-03-13")).toBe(
      Date.UTC(2026, 2, 13, 4, 0, 0) / 1000
    );
  });

  it("rejects impossible billing dates", () => {
    expect(() => newYorkBillingDateToStripeAnchor("2026-02-30")).toThrow(
      "valid calendar date"
    );
  });
});
