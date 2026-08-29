import { describe, expect, it } from "vitest";
import {
  hasManifestRouteEvidence,
  hasServiceActivity,
  routeEvidenceStatus,
  sourceCoverage,
} from "./serviceRouteEvidence";

describe("selected-day route evidence", () => {
  it("requires DSW, DRO, manifest, and FCC for complete evidence", () => {
    expect(
      routeEvidenceStatus({
        dsw: true,
        dro: true,
        manifest: true,
        fcc: true,
        dispatch: true,
      })
    ).toMatchObject({ key: "complete", label: "Complete evidence", missing: [] });
  });

  it("names every missing operational source without treating Dispatch as execution evidence", () => {
    expect(
      routeEvidenceStatus({
        dsw: true,
        dro: false,
        manifest: false,
        fcc: true,
        dispatch: true,
      })
    ).toMatchObject({
      key: "missing",
      label: "Missing DRO · Manifest",
      missing: ["DRO", "Manifest"],
    });
  });

  it("surfaces identity conflicts ahead of source completeness", () => {
    expect(
      routeEvidenceStatus({
        dsw: true,
        dro: true,
        manifest: true,
        fcc: true,
        dispatch: true,
        identityConflict: true,
      }).key
    ).toBe("conflict");
  });

  it("counts source coverage across the route inventory", () => {
    const coverage = sourceCoverage([
      { dsw: true, dro: true, manifest: true, fcc: false, dispatch: true },
      { dsw: true, dro: false, manifest: false, fcc: true, dispatch: false },
    ]);

    expect(coverage).toEqual([
      { key: "dro", label: "DRO", represented: 1, total: 2 },
      { key: "dsw", label: "DSW", represented: 2, total: 2 },
      { key: "manifest", label: "Manifest", represented: 1, total: 2 },
      { key: "fcc", label: "FCC", represented: 1, total: 2 },
    ]);
  });

  it("does not count an empty capture-plan shell as manifest evidence", () => {
    expect(hasManifestRouteEvidence({ artifacts: { total: 0 } })).toBe(false);
    expect(hasManifestRouteEvidence({ delivery: { stop_count: 1 } })).toBe(true);
  });

  it("excludes FCC shells and Dispatch-only records from the service report", () => {
    expect(
      hasServiceActivity({
        dsw: false,
        dro: false,
        manifest: false,
        fccActivity: false,
      })
    ).toBe(false);
    expect(
      hasServiceActivity({
        dsw: false,
        dro: false,
        manifest: false,
        fccActivity: true,
      })
    ).toBe(true);
  });
});
