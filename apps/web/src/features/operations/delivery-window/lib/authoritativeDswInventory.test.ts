import { describe, expect, it } from "vitest";
import {
  inventoryRowToDswRow,
  shouldUseDswInventory,
} from "./authoritativeDswInventory";

describe("authoritative DSW inventory", () => {
  it("prefers FINAL inventory over an in-day route snapshot", () => {
    expect(shouldUseDswInventory("DSW_FINAL", 23)).toBe(true);
    expect(shouldUseDswInventory("DSW_IN_DAY", 23)).toBe(false);
  });

  it("uses route inventory when the in-day endpoint has no rows", () => {
    expect(shouldUseDswInventory("DSW_IN_DAY", 0)).toBe(true);
  });

  it("marks synthesized FINAL rows so unavailable package plans are not shown as zero", () => {
    expect(
      inventoryRowToDswRow({
        inventory_source: "DSW_FINAL",
        route_key: "447",
        route_label: "Peak BPV 25",
        planned_delivery_stops: 41,
        actual_delivery_stops: 10,
        actual_delivery_packages: 11,
      })
    ).toMatchObject({
      wa_number: "447",
      route_name: "Peak BPV 25",
      authoritative_inventory_only: true,
      planned_delivery_stops: 41,
      actual_delivery_stops: 10,
      actual_delivery_packages: 11,
    });
  });
});
