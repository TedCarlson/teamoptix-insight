import { describe, expect, it } from "vitest";
import {
  createInternalMapStyle,
  createInternalMapSource,
  internalMapColors,
} from "./internalMapStyle";

describe("internal road map contract", () => {
  it("starts from a dependency-free internal background style", () => {
    const style = createInternalMapStyle();

    expect(style.sources).toEqual({});
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
  });

  it("owns both light and dark map palettes", () => {
    const light = createInternalMapStyle("light");
    const dark = createInternalMapStyle("dark");

    expect(light.layers[0]).toMatchObject({
      paint: { "background-color": "#e8eee9" },
    });
    expect(dark.layers[0]).toMatchObject({
      paint: { "background-color": "#0b1523" },
    });
    expect(internalMapColors("dark").zctaLine).toBe("#a78bfa");
  });

  it("uses only the authenticated TeamOptix road tile endpoint", () => {
    const source = createInternalMapSource(
      "beacon-point-ventures",
      "https://teamoptix.io",
    );

    expect(source).toMatchObject({
      type: "vector",
      tiles: [
        "https://teamoptix.io/api/company/beacon-point-ventures/maps/tiles/{z}/{x}/{y}",
      ],
    });
  });

  it("encodes the company boundary in the tile URL", () => {
    const source = createInternalMapSource(
      "customer / east",
      "https://teamoptix.io/",
    );

    expect(source).toMatchObject({
      tiles: [
        "https://teamoptix.io/api/company/customer%20%2F%20east/maps/tiles/{z}/{x}/{y}",
      ],
    });
  });
});
