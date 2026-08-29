import { describe, expect, it } from "vitest";
import {
  createInternalMapStyle,
  createInternalRegionalMapSource,
  createInternalMapSource,
  internalMapColors,
} from "./internalMapStyle";

describe("internal road map contract", () => {
  it("starts from a dependency-free internal background style", () => {
    const style = createInternalMapStyle();

    expect(style.sources).toEqual({});
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
    expect(style.glyphs).toBe("/map-assets/fonts/{fontstack}/{range}.pbf");
    expect(style.sprite).toBe("/map-assets/sprites/v4/light");
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

  it("uses an absolute same-origin sprite URL in the browser contract", () => {
    const style = createInternalMapStyle("dark", "https://teamoptix.io/");

    expect(style.sprite).toBe("https://teamoptix.io/map-assets/sprites/v4/dark");
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

  it("keeps the regional archive behind the authenticated company map contract", () => {
    const source = createInternalRegionalMapSource({
      pack_key: "sc-ga-20260828-z14",
      coverage_key: "US-SC-GA",
      source_snapshot: "2026-08-28",
      schema_version: "4.15.2",
      byte_length: 458398690,
      sha256: "20bd174bbfc3d89b50c989c4f778a9e6121c42ccc412d73e3959a4fe843a6d7f",
      min_zoom: 0,
      max_zoom: 14,
      west: -85.7,
      south: 30.3,
      east: -78.4,
      north: 35.3,
      attribution_html: "OpenStreetMap contributors",
      archive_url: "/api/company/beacon-point-ventures/maps/reference/sc-ga-20260828-z14.pmtiles",
      bounds: [-85.7, 30.3, -78.4, 35.3],
    }, "https://teamoptix.io/");

    expect(source).toMatchObject({
      type: "vector",
      url: "pmtiles://https://teamoptix.io/api/company/beacon-point-ventures/maps/reference/sc-ga-20260828-z14.pmtiles",
      minzoom: 0,
      maxzoom: 14,
      attribution: "OpenStreetMap contributors",
    });
  });
});
