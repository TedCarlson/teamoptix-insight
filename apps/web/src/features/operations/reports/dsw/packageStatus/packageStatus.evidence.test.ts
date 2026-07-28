import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  annotateManifestPackageEvidence,
  expressEvidenceCountsByRoute,
  markPackageEvidenceUnavailable,
} from "./packageStatus.evidence";
import { trackingReference } from "./packageStatus.crypto";

const ORIGINAL_HMAC_KEY = process.env.TRACKING_REFERENCE_HMAC_KEY;

describe("DSW package evidence classification", () => {
  beforeEach(() => {
    process.env.TRACKING_REFERENCE_HMAC_KEY =
      "synthetic-package-evidence-key";
  });

  afterEach(() => {
    if (ORIGINAL_HMAC_KEY === undefined) {
      delete process.env.TRACKING_REFERENCE_HMAC_KEY;
    } else {
      process.env.TRACKING_REFERENCE_HMAC_KEY = ORIGINAL_HMAC_KEY;
    }
  });

  it("separates current coded, completed, and tracking-gap packages", () => {
    const companyId = "company-a";
    const codedReference = trackingReference({
      companyId,
      trackingId: "TRACK-OPEN",
    }).tracking_ref;
    const packages = annotateManifestPackageEvidence({
      companyId,
      packages: [
        {
          route_key: "BPV 01",
          tracking_id: "TRACK-OPEN",
          is_express: true,
        },
        {
          route_key: "BPV 01",
          tracking_id: "TRACK-COMPLETE",
          is_express: true,
        },
        {
          route_key: "BPV 01",
          tracking_id: "",
          is_express: true,
        },
      ],
      currentStatusRows: [
        {
          tracking_ref: codedReference,
          vsa_status_code: "0",
          star_status_code: "7",
          star_scan_at_local: "2026-07-28T14:05:00",
        },
      ],
    });

    expect(
      packages.map((row) => row.delivery_evidence_state)
    ).toEqual(["OPEN_CODED", "COMPLETED", "NEEDS_ATTENTION"]);
    expect(packages[0]).toMatchObject({
      status_code_source: "STAR",
      vsa_status_code: null,
      star_status_code: "7",
      status_code_at_local: "2026-07-28T14:05:00",
    });
    expect(expressEvidenceCountsByRoute(packages).get("BPV 01")).toEqual({
      package_count: 3,
      completed_package_count: 1,
      open_package_count: 1,
      tracking_gap_package_count: 1,
    });
  });

  it("scopes the match to the company HMAC", () => {
    const otherTenantReference = trackingReference({
      companyId: "company-b",
      trackingId: "TRACK-OPEN",
    }).tracking_ref;
    const [packageRow] = annotateManifestPackageEvidence({
      companyId: "company-a",
      packages: [
        {
          route_key: "BPV 01",
          tracking_id: "TRACK-OPEN",
          is_express: true,
        },
      ],
      currentStatusRows: [{ tracking_ref: otherTenantReference }],
    });

    expect(packageRow.delivery_evidence_state).toBe("COMPLETED");
  });

  it("keeps manifest rows visible when local evidence configuration is absent", () => {
    const packages = markPackageEvidenceUnavailable([
      {
        route_key: "BPV 01",
        tracking_id: "TRACK-OPEN",
        is_express: true,
      },
    ]);

    expect(packages[0]).toMatchObject({
      delivery_evidence_state: "NEEDS_ATTENTION",
      delivery_evidence_basis: "EVIDENCE_CONFIGURATION_REQUIRED",
    });
    expect(expressEvidenceCountsByRoute(packages).get("BPV 01")).toEqual({
      package_count: 1,
      completed_package_count: 0,
      open_package_count: 0,
      tracking_gap_package_count: 1,
    });
  });
});
