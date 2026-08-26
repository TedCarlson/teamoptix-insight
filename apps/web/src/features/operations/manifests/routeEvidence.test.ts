import { describe, expect, it } from "vitest";
import {
  manifestDetailRequestUrl,
  preferredManifestRouteKey,
} from "./routeEvidence";

describe("Service route evidence authority", () => {
  it("puts the selected service date and route into the warehouse request", () => {
    expect(
      manifestDetailRequestUrl({
        slug: "beacon-point-ventures",
        serviceDate: "2026-08-18",
        routeKey: "447",
      })
    ).toBe(
      "/api/company/beacon-point-ventures/operations/route-health?serviceDate=2026-08-18&routeKey=447"
    );
  });

  it("prefers the linked warehouse route key and normalizes a WA fallback", () => {
    expect(preferredManifestRouteKey("447", "WA 447", "Peak BPV 25")).toBe(
      "447"
    );
    expect(preferredManifestRouteKey(null, "WA 430", "BPV 01")).toBe("430");
  });
});
