import { describe, expect, it } from "vitest";
import { persistentOperationsSurface } from "./operationsWorkspaceRoute";

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
