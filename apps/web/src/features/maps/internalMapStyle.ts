import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";
import type {
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";
import { addProtocol, setWorkerUrl } from "maplibre-gl";
import { Protocol } from "pmtiles";
import {
  internalMapReferenceDescriptor,
  type InternalMapReferenceDescriptor,
} from "./internalMapReference";

const sourceId = "teamoptix-internal-map";
const regionalSourceId = "teamoptix-regional-basemap";
const regionalLayerPrefix = "internal-basemap-";
let workerConfigured = false;
let protocolConfigured = false;

export type InternalMapTheme = "light" | "dark";

const mapColors = {
  light: {
    land: "#e8eee9",
    localCasing: "#c7cfd4",
    localRoad: "#ffffff",
    majorCasing: "#94a3ad",
    majorRoad: "#f8fafc",
    zctaCasing: "#ffffff",
    zctaLine: "#7c3aed",
    routeCasing: "#ffffff",
    routeLine: "#2563eb",
  },
  dark: {
    land: "#0b1523",
    localCasing: "#111c2c",
    localRoad: "#33465d",
    majorCasing: "#07101d",
    majorRoad: "#60748c",
    zctaCasing: "#07101d",
    zctaLine: "#a78bfa",
    routeCasing: "#07101d",
    routeLine: "#60a5fa",
  },
} as const;

export function configureInternalMapWorker() {
  if (!workerConfigured) {
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    workerConfigured = true;
  }
  if (!protocolConfigured) {
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
    protocolConfigured = true;
  }
}

export function currentInternalMapTheme(): InternalMapTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function internalMapColors(theme: InternalMapTheme) {
  return mapColors[theme];
}

export function createInternalMapStyle(
  theme: InternalMapTheme = "light",
  origin?: string,
): StyleSpecification {
  return {
    version: 8,
    glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
    sprite: origin
      ? `${origin.replace(/\/$/, "")}/map-assets/sprites/v4/${theme}`
      : `/map-assets/sprites/v4/${theme}`,
    sources: {},
    layers: [
      {
        id: "internal-land",
        type: "background",
        paint: { "background-color": mapColors[theme].land },
      },
    ],
  };
}

export function createInternalMapSource(
  companySlug: string,
  origin: string,
): VectorSourceSpecification {
  const tilePath = `/api/company/${encodeURIComponent(companySlug)}/maps/tiles/{z}/{x}/{y}`;
  return {
    type: "vector",
    tiles: [`${origin.replace(/\/$/, "")}${tilePath}`],
    minzoom: 7,
    maxzoom: 16,
    attribution: "U.S. Census Bureau TIGER/Line 2025",
  };
}

export function createInternalRegionalMapSource(
  descriptor: InternalMapReferenceDescriptor,
  origin: string,
): VectorSourceSpecification {
  const archiveUrl = `${origin.replace(/\/$/, "")}${descriptor.archive_url}`;
  return {
    type: "vector",
    url: `pmtiles://${archiveUrl}`,
    minzoom: descriptor.min_zoom,
    maxzoom: descriptor.max_zoom,
    attribution: descriptor.attribution_html,
  };
}

function regionalLayers(theme: InternalMapTheme) {
  return protomapsLayers(regionalSourceId, namedFlavor(theme), { lang: "en" })
    .filter((layer) => layer.type !== "background")
    .map((layer) => ({ ...layer, id: `${regionalLayerPrefix}${layer.id}` })) as LayerSpecification[];
}

async function regionalDescriptor(
  companySlug: string,
  origin: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${origin.replace(/\/$/, "")}/api/company/${encodeURIComponent(companySlug)}/maps/reference`,
    { credentials: "same-origin", signal },
  );
  if (!response.ok) return null;
  return internalMapReferenceDescriptor(await response.json());
}

function addCensusRoadLayers(map: MapLibreMap, companySlug: string, origin: string) {
  const colors = mapColors[currentInternalMapTheme()];
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, createInternalMapSource(companySlug, origin));
  }

  const layers: LayerSpecification[] = [
    {
      id: "internal-local-road-casing",
      type: "line",
      source: sourceId,
      "source-layer": "roads",
      minzoom: 11,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.localCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.4, 16, 5],
      },
    },
    {
      id: "internal-local-roads",
      type: "line",
      source: sourceId,
      "source-layer": "roads",
      minzoom: 11,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.localRoad,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 16, 3.2],
      },
    },
    {
      id: "internal-major-road-casing",
      type: "line",
      source: sourceId,
      "source-layer": "roads",
      maxzoom: 12,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.majorCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.8, 12, 4.5],
      },
    },
    {
      id: "internal-major-roads",
      type: "line",
      source: sourceId,
      "source-layer": "roads",
      maxzoom: 12,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.majorRoad,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 12, 3],
      },
    },
  ];

  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
}

export async function addInternalRoadLayers(
  map: MapLibreMap,
  companySlug: string,
  origin: string,
  signal?: AbortSignal,
) {
  try {
    const descriptor = await regionalDescriptor(companySlug, origin, signal);
    if (signal?.aborted) return "aborted" as const;
    if (descriptor) {
      if (!map.getSource(regionalSourceId)) {
        map.addSource(regionalSourceId, createInternalRegionalMapSource(descriptor, origin));
      }
      for (const layer of regionalLayers(currentInternalMapTheme())) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
      map.triggerRepaint();
      return "regional" as const;
    }
  } catch (error) {
    if (signal?.aborted) return "aborted" as const;
    console.warn("Regional basemap unavailable; using the internal Census fallback.", error);
  }
  addCensusRoadLayers(map, companySlug, origin);
  map.triggerRepaint();
  return "census" as const;
}

export function addInternalZctaBoundaryLayers(
  map: MapLibreMap,
  companySlug: string,
  origin: string,
) {
  const colors = mapColors[currentInternalMapTheme()];
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, createInternalMapSource(companySlug, origin));
  }

  const layers: LayerSpecification[] = [
    {
      id: "internal-zcta-boundary-casing",
      type: "line",
      source: sourceId,
      "source-layer": "zcta_boundaries",
      minzoom: 7,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.zctaCasing,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 12, 5],
        "line-opacity": 0.82,
      },
    },
    {
      id: "internal-zcta-boundaries",
      type: "line",
      source: sourceId,
      "source-layer": "zcta_boundaries",
      minzoom: 7,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.zctaLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 12, 2.4],
        "line-opacity": 0.76,
        "line-dasharray": [3, 2],
      },
    },
  ];

  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
  map.triggerRepaint();
}

export function applyInternalMapTheme(
  map: MapLibreMap,
  theme: InternalMapTheme,
  origin?: string,
) {
  const colors = mapColors[theme];
  const lineColors: Record<string, string> = {
    "internal-local-road-casing": colors.localCasing,
    "internal-local-roads": colors.localRoad,
    "internal-major-road-casing": colors.majorCasing,
    "internal-major-roads": colors.majorRoad,
    "internal-zcta-boundary-casing": colors.zctaCasing,
    "internal-zcta-boundaries": colors.zctaLine,
    "route-path-shadow": colors.routeCasing,
    "route-path-line": colors.routeLine,
  };

  if (map.getLayer("internal-land")) {
    map.setPaintProperty("internal-land", "background-color", colors.land);
  }
  for (const layer of regionalLayers(theme)) {
    if (!map.getLayer(layer.id) || !layer.paint) continue;
    for (const [property, value] of Object.entries(layer.paint)) {
      map.setPaintProperty(
        layer.id,
        property as Parameters<MapLibreMap["setPaintProperty"]>[1],
        value,
      );
    }
  }
  if (map.getSource(regionalSourceId)) {
    const spriteUrl = origin
      ? `${origin.replace(/\/$/, "")}/map-assets/sprites/v4/${theme}`
      : `/map-assets/sprites/v4/${theme}`;
    map.setSprite(spriteUrl);
  }
  for (const [layerId, color] of Object.entries(lineColors)) {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, "line-color", color);
  }
}

export function observeInternalMapTheme(map: MapLibreMap, origin?: string) {
  const applyTheme = () => applyInternalMapTheme(map, currentInternalMapTheme(), origin);
  const observer = new MutationObserver(applyTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  applyTheme();
  return () => observer.disconnect();
}
