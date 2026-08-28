import type {
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";

const sourceId = "teamoptix-internal-map";
let workerConfigured = false;

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
  if (workerConfigured) return;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  workerConfigured = true;
}

export function currentInternalMapTheme(): InternalMapTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function internalMapColors(theme: InternalMapTheme) {
  return mapColors[theme];
}

export function createInternalMapStyle(
  theme: InternalMapTheme = "light",
): StyleSpecification {
  return {
    version: 8,
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

export function addInternalRoadLayers(
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
  map.triggerRepaint();
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
  for (const [layerId, color] of Object.entries(lineColors)) {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, "line-color", color);
  }
}

export function observeInternalMapTheme(map: MapLibreMap) {
  const applyTheme = () => applyInternalMapTheme(map, currentInternalMapTheme());
  const observer = new MutationObserver(applyTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  applyTheme();
  return () => observer.disconnect();
}
