import { describe, expect, it } from "vitest";
import { deriveManifestServiceFlags } from "./manifest.serviceFlags";

describe("deriveManifestServiceFlags", () => {
  it.each([
    "EXP",
    "RES EXP",
    "DSIGNEXP",
    "DSIGNRES EXP",
    "RES ASIGNEXP",
    "ISIGNRES EXP",
    "ISIGNEXP",
    "HAZ DSIGNEXP",
    "HAZ ASIGNEXP",
    "ASIGNEXP",
  ])("classifies supported Express premium service %s", (value) => {
    expect(deriveManifestServiceFlags(value).is_express).toBe(true);
  });

  it.each(["", "RES", "DSIGN", "EXPERIMENTAL", "EXPRESS SAVER"]) (
    "does not classify unrelated premium service %s as Express",
    (value) => {
      expect(deriveManifestServiceFlags(value).is_express).toBe(false);
    }
  );
});
