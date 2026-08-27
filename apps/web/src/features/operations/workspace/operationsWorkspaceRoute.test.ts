import { describe, expect, it } from "vitest";
import {
  canAccessPersistentOperationsSurface,
  persistentOperationsSurface,
  type PersistentOperationsAccess,
} from "./operationsWorkspaceRoute";

const slug = "beacon-point-ventures";

describe("persistentOperationsSurface", () => {
  it.each([
    [`/company/${slug}/operations`, "operations"],
    [`/company/${slug}/operations/`, "operations"],
    [`/company/${slug}/operations/dispatch`, "dispatch"],
    [`/company/${slug}/operations/service`, "service"],
    [`/company/${slug}/operations/planning`, "planning"],
  ])("maps %s to %s", (pathname, expected) => {
    expect(persistentOperationsSurface(pathname, slug)).toBe(expected);
  });

  it("leaves supporting Operations activities to their own routes", () => {
    expect(
      persistentOperationsSurface(
        `/company/${slug}/operations/walk-ons`,
        slug
      )
    ).toBeNull();
  });
});

describe("canAccessPersistentOperationsSurface", () => {
  const limitedAccess: PersistentOperationsAccess = {
    operations: false,
    dispatch: true,
    service: true,
    planning: false,
  };

  it("keeps granted operational surfaces available", () => {
    expect(canAccessPersistentOperationsSurface("dispatch", limitedAccess)).toBe(true);
    expect(canAccessPersistentOperationsSurface("service", limitedAccess)).toBe(true);
  });

  it("blocks the upload workspace and other ungranted surfaces", () => {
    expect(canAccessPersistentOperationsSurface("operations", limitedAccess)).toBe(false);
    expect(canAccessPersistentOperationsSurface("planning", limitedAccess)).toBe(false);
  });

  it("does not interfere with non-persistent child routes", () => {
    expect(canAccessPersistentOperationsSurface(null, limitedAccess)).toBe(true);
  });
});
