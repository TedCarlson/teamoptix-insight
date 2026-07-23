import { describe, expect, it } from "vitest";
import type {
  DeliveryManifestPackageRow,
  DeliveryManifestStopRow,
} from "./deliveryManifest.parse";
import {
  dedupeDeliveryManifestPackages,
  dedupeDeliveryManifestStops,
} from "./deliveryManifest.dedupe";

function stop(overrides: Partial<DeliveryManifestStopRow> = {}): DeliveryManifestStopRow {
  return {
    st_number: "10",
    sid: "SID-10",
    package_count: 1,
    recipient: "Synthetic Recipient",
    contact_name: "Synthetic Contact",
    address_line_1: "100 Test Avenue",
    address_line_2: "",
    city: "Testville",
    state: "TS",
    postal_code: "00000",
    stop_instructions: "",
    phone: "",
    completed: "",
    delivery_time_begin: "",
    delivery_time_end: "",
    ...overrides,
  };
}

function deliveryPackage(
  overrides: Partial<DeliveryManifestPackageRow> = {}
): DeliveryManifestPackageRow {
  return {
    st_number: "10",
    sid: "SID-10",
    recipient: "Synthetic Recipient",
    contact_name: "Synthetic Contact",
    address_line_1: "100 Test Avenue",
    address_line_2: "",
    city: "Testville",
    state: "TS",
    postal_code: "00000",
    tracking_id: "TRACK-0001",
    prem_svc_raw: "",
    is_express: false,
    is_residential: false,
    is_signature: false,
    is_hazmat: false,
    is_collection: false,
    ...overrides,
  };
}

describe("delivery manifest deduplication", () => {
  it("keeps the more complete duplicate stop", () => {
    const result = dedupeDeliveryManifestStops([
      stop(),
      stop({ completed: "Y", delivery_time_end: "17:30", package_count: 2 }),
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      completed: "Y",
      delivery_time_end: "17:30",
      package_count: 2,
    });
  });

  it("preserves distinct rows through canonical detail identity", () => {
    const result = dedupeDeliveryManifestStops([
      stop({ st_number: "0", sid: "", recipient: "Synthetic A" }),
      stop({ st_number: "", sid: "", recipient: "Synthetic B" }),
    ]);

    expect(result.unidentifiedCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it("deduplicates the same SID even when stop numbers differ", () => {
    const result = dedupeDeliveryManifestStops([
      stop({ st_number: "10", sid: "sid-shared" }),
      stop({ st_number: "11", sid: "SID-SHARED", completed: "Y" }),
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].st_number).toBe("11");
  });

  it("trims tracking identity and keeps the richer duplicate package", () => {
    const result = dedupeDeliveryManifestPackages([
      deliveryPackage({ tracking_id: " TRACK-0001 " }),
      deliveryPackage({ tracking_id: "TRACK-0001", prem_svc_raw: "Priority Overnight" }),
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tracking_id).toBe("TRACK-0001");
    expect(result.rows[0].prem_svc_raw).toBe("Priority Overnight");
  });

  it("retains blank tracking rows without merging them", () => {
    const result = dedupeDeliveryManifestPackages([
      deliveryPackage({ tracking_id: "", st_number: "10" }),
      deliveryPackage({ tracking_id: " ", st_number: "11" }),
    ]);

    expect(result.unidentifiedCount).toBe(2);
    expect(result.duplicateCount).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it("is idempotent", () => {
    const first = dedupeDeliveryManifestPackages([
      deliveryPackage(),
      deliveryPackage({ prem_svc_raw: "Priority Overnight" }),
    ]);
    const second = dedupeDeliveryManifestPackages(first.rows);

    expect(second.rows).toEqual(first.rows);
    expect(second.duplicateCount).toBe(0);
  });
});
