import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEDEX_ROLE,
  FEDEX_ROLE_OPTIONS,
  getFedExRoleOptions,
} from "./fedexRoleOptions";

describe("FedEx role options", () => {
  it("defaults new records to Driver", () => {
    expect(DEFAULT_FEDEX_ROLE).toBe("Driver");
  });

  it("exposes the temporary governed catalog in order", () => {
    expect(FEDEX_ROLE_OPTIONS.map((option) => option.value)).toEqual([
      "Driver",
      "AVP Driver",
      "Jumper / Helper",
      "Lead Driver",
      "Business Contact",
      "Assistant BC",
      "Fleet Manager",
      "Mechanic",
      "Other",
    ]);
  });

  it("preserves an existing role that is outside the temporary catalog", () => {
    expect(getFedExRoleOptions("Seasonal Coordinator").at(-1)).toEqual({
      key: "legacy:Seasonal Coordinator",
      label: "Seasonal Coordinator (current)",
      value: "Seasonal Coordinator",
    });
  });
});
