import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encryptTransientPackageIdentity,
  normalizeTrackingId,
  trackingReference,
} from "./packageStatus.crypto";

const ORIGINAL_ENV = {
  hmac: process.env.TRACKING_REFERENCE_HMAC_KEY,
  version: process.env.TRACKING_REFERENCE_HMAC_VERSION,
  encryption: process.env.TRACKING_TRANSIENT_ENCRYPTION_KEY,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("DSW package-status privacy helpers", () => {
  beforeEach(() => {
    process.env.TRACKING_REFERENCE_HMAC_KEY =
      "synthetic-test-reference-key";
    process.env.TRACKING_REFERENCE_HMAC_VERSION = "v1";
    process.env.TRACKING_TRANSIENT_ENCRYPTION_KEY =
      Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    restoreEnvironment(
      "TRACKING_REFERENCE_HMAC_KEY",
      ORIGINAL_ENV.hmac
    );
    restoreEnvironment(
      "TRACKING_REFERENCE_HMAC_VERSION",
      ORIGINAL_ENV.version
    );
    restoreEnvironment(
      "TRACKING_TRANSIENT_ENCRYPTION_KEY",
      ORIGINAL_ENV.encryption
    );
  });

  it("normalizes tracking IDs and scopes references by tenant", () => {
    expect(normalizeTrackingId(" 0874-7406 59370 ")).toBe(
      "0874740659370"
    );

    const first = trackingReference({
      companyId: "company-a",
      trackingId: "0874740659370",
    });
    const same = trackingReference({
      companyId: "company-a",
      trackingId: "0874 7406 59370",
    });
    const otherTenant = trackingReference({
      companyId: "company-b",
      trackingId: "0874740659370",
    });

    expect(first).toEqual(same);
    expect(first.tracking_ref).toMatch(/^v1_[a-f0-9]{64}$/);
    expect(otherTenant.tracking_ref).not.toBe(first.tracking_ref);
  });

  it("does not retain plaintext identity in encrypted fields", () => {
    const trackingId = "0874740659370";
    const destinationAddress = "REDACTED TEST DESTINATION";
    const encrypted = encryptTransientPackageIdentity({
      tracking_id: trackingId,
      destination_address: destinationAddress,
    });
    const serialized = JSON.stringify(encrypted);

    expect(serialized).not.toContain(trackingId);
    expect(serialized).not.toContain(destinationAddress);
    expect(Buffer.from(encrypted.transient_payload_iv, "base64")).toHaveLength(
      12
    );
    expect(
      Buffer.from(encrypted.transient_payload_auth_tag, "base64")
    ).toHaveLength(16);
    expect(encrypted.transient_payload_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
