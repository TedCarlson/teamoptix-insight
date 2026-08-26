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

    expect(manifestDeliveryStopTitle(row)).toBe("Stop 12");
    expect(manifestPickupStopTitle(row)).toBe("Pickup stop 4");
    expect(manifestDeliveryStopTitle(row)).not.toContain("Customer Name");
    expect(manifestPickupStopTitle(row)).not.toContain("Business Name");
  });
});
