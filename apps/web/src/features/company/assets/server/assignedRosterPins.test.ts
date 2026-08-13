import { describe, expect, it } from "vitest";
import type { CompanyAssetRow } from "../asset.types";
import { mergeAssignedRosterPins } from "./assignedRosterPins";

function fuelCard(
  overrides: Partial<CompanyAssetRow> = {},
): CompanyAssetRow {
  return {
    asset_id: "asset-1",
    company_slug: "acme",
    asset_type_key: "FUEL_CARD",
    asset_type_label: "Fuel Card",
    status_key: "ASSIGNED",
    status_label: "Assigned",
    status_group: "ACTIVE",
    status_sort_order: 1,
    is_assignable: true,
    asset_identifier: "6741-2",
    display_name: null,
    asset_provider_id: null,
    provider: null,
    secondary_identifier: "legacy-asset-pin",
    notes: null,
    assignment_muted: false,
    assigned_person_id: null,
    assigned_person_name: null,
    assigned_roster_member_id: "roster-1",
    assigned_roster_member_name: "Stacy Simpkins",
    assigned_at: null,
    released_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe("mergeAssignedRosterPins", () => {
  it("reads PIN from the assigned roster member, not the asset", () => {
    const [result] = mergeAssignedRosterPins(
      [fuelCard()],
      [{ roster_id: "roster-1", pin_id_no: "2468" }],
    );

    expect(result.assigned_roster_pin).toBe("2468");
    expect(result.assigned_roster_pin).not.toBe(result.secondary_identifier);
  });

  it("does not fall back to a legacy asset PIN", () => {
    const [result] = mergeAssignedRosterPins([fuelCard()], []);

    expect(result.assigned_roster_pin).toBeNull();
  });

  it("does not expose a PIN when the fuel card is unassigned", () => {
    const [result] = mergeAssignedRosterPins(
      [fuelCard({ assigned_roster_member_id: null })],
      [{ roster_id: "roster-1", pin_id_no: "2468" }],
    );

    expect(result.assigned_roster_pin).toBeNull();
  });
});
