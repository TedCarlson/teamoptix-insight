import { describe, expect, it } from "vitest";
import {
  applyManifestIdentityAccess,
  resolveManifestIdentityAccess,
} from "./manifestIdentityAccess";

describe("manifest verified-credential identity gate", () => {
  it("releases the original manifest when the stored FedEx credential is verified healthy", () => {
    const access = resolveManifestIdentityAccess({
      profileStatus: "HEALTHY",
      hasSecret: true,
      lastVerifiedAt: "2026-07-27T18:27:15.746961Z",
      lastVerificationResult: "SUCCESS",
    });
    const row = {
      recipient: "Customer Name",
      contact_name: "Contact Name",
      address_line_1: "100 TEST RD",
    };

    expect(access.mode).toBe("FULL");
    expect(applyManifestIdentityAccess(row, access)).toBe(row);
  });

  it("redacts names before delivery when credentials are not verified", () => {
    const access = resolveManifestIdentityAccess({
      profileStatus: "CONFIGURED",
      hasSecret: true,
      lastVerifiedAt: null,
      lastVerificationResult: null,
    });
    const row = {
      recipient: "Customer Name",
      contact_name: "Contact Name",
      shipper_name: "Business Name",
      address_line_1: "100 TEST RD",
    };

    expect(access.mode).toBe("REDACTED");
    expect(applyManifestIdentityAccess(row, access)).toEqual({
      recipient: null,
      contact_name: null,
      shipper_name: null,
      address_line_1: "100 TEST RD",
    });
  });

  it("fails closed when verification has been revoked or requires action", () => {
    expect(
      resolveManifestIdentityAccess({
        profileStatus: "ACTION_REQUIRED",
        hasSecret: true,
        lastVerifiedAt: "2026-07-27T18:27:15.746961Z",
        lastVerificationResult: "INVALID_CREDENTIALS",
      }).verified
    ).toBe(false);
  });
});
