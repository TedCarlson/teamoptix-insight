import { describe, expect, it } from "vitest";
import {
  manifestDeliveryStopTitle,
  manifestPickupStopTitle,
} from "./manifestDrawerIdentity";

describe("manifest drawer identity boundary", () => {
  it("labels operational stops without recipient or shipper names", () => {
    const row = {
      st_number: 12,
      pickup_list: 4,
      recipient: "Customer Name",
      shipper_name: "Business Name",
      contact_name: "Contact Name",
    };

    expect(manifestDeliveryStopTitle(row, false)).toBe("Stop 12");
    expect(manifestPickupStopTitle(row, false)).toBe("Pickup stop 4");
    expect(manifestDeliveryStopTitle(row, false)).not.toContain("Customer Name");
    expect(manifestPickupStopTitle(row, false)).not.toContain("Business Name");
  });

  it("restores the original manifest names for verified credentials", () => {
    const row = {
      st_number: 12,
      pickup_list: 4,
      recipient: "Customer Name",
      shipper_name: "Business Name",
    };

    expect(manifestDeliveryStopTitle(row, true)).toBe(
      "Stop 12 · Customer Name"
    );
    expect(manifestPickupStopTitle(row, true)).toBe(
      "Pickup stop 4 · Business Name"
    );
  });
});
