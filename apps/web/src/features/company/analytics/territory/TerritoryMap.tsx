"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type StyleSpecification,
} from "maplibre-gl";
import { zipNumber } from "@/features/opportunity-analysis/zipIntelligence";
import { territoryWorkload, type TerritoryPayload, type TerritoryRow } from "./territoryIntelligence";
import styles from "./territory-intelligence.module.css";

const rucaColors: Record<string, string> = {
  METROPOLITAN: "#24364d",
  MICROPOLITAN: "#286a8d",
  SMALL_TOWN: "#b66b13",
  RURAL: "#8e4e28",
  UNKNOWN: "#778397",
};

const territoryRasterStyle: StyleSpecification = {
  version: 8,
  sources: {
    "openstreetmap-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "openstreetmap-raster",
      type: "raster",
      source: "openstreetmap-raster",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

function resolvedTerminalPoint(
  rows: TerritoryRow[],
  terminal: TerritoryPayload["terminal"],
): { latitude: number; longitude: number } | null {
  if (terminal.latitude !== null && terminal.longitude !== null) {
    return { latitude: terminal.latitude, longitude: terminal.longitude };
  }
  const terminalZip = terminal.submitted_address?.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  const row = terminalZip
    ? rows.find((candidate) => String(candidate.zip_code) === terminalZip)
    : null;
  return row?.latitude !== null && row?.latitude !== undefined && row.longitude !== null && row.longitude !== undefined
    ? { latitude: zipNumber(row.latitude), longitude: zipNumber(row.longitude) }
    : null;
}

function boundsFor(
  rows: TerritoryRow[],
  terminalPoint?: { latitude: number; longitude: number } | null,
) {
  const longitudes = rows.map((row) => zipNumber(row.longitude));
  const latitudes = rows.map((row) => zipNumber(row.latitude));
  if (terminalPoint) {
    longitudes.push(terminalPoint.longitude);
    latitudes.push(terminalPoint.latitude);
  }
  let west = Math.min(...longitudes);
  let east = Math.max(...longitudes);
  let south = Math.min(...latitudes);
  let north = Math.max(...latitudes);
  if (west === east) { west -= 0.05; east += 0.05; }
  if (south === north) { south -= 0.05; north += 0.05; }
  return [[west, south], [east, north]] as [[number, number], [number, number]];
}

function centerFor(bounds: [[number, number], [number, number]]) {
  return [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ] as [number, number];
}

function popupContent(row: TerritoryRow) {
  const root = document.createElement("div");
  root.className = styles.mapPopup;
  const title = document.createElement("strong");
  title.textContent = row.zip_code;
  const place = document.createElement("span");
  place.textContent = row.preferred_city ? `${row.preferred_city}, ${row.state_code}` : "Known service area";
  const details = document.createElement("small");
  details.textContent = `${territoryWorkload(row).toLocaleString()} observed stops · ${zipNumber(row.delivery_packages).toLocaleString()} packages`;
  const context = document.createElement("small");
  context.textContent = `${row.ruca_category?.replaceAll("_", " ") ?? "Unclassified"} · ${row.terminal_distance_miles === null ? "terminal distance unresolved" : `${zipNumber(row.terminal_distance_miles).toLocaleString(undefined, { maximumFractionDigits: 1 })} mi from terminal`}`;
  root.append(title, place, details, context);
  return root;
}

export default function TerritoryMap({
  rows,
  terminal,
}: {
  rows: TerritoryRow[];
  terminal: TerritoryPayload["terminal"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const terminalPoint = useMemo(() => resolvedTerminalPoint(rows, terminal), [rows, terminal]);
  const coreBounds = rows.length ? boundsFor(rows, terminalPoint) : null;

  useEffect(() => {
    if (!containerRef.current || !rows.length) return;
    const maxWorkload = Math.max(1, ...rows.map(territoryWorkload));
    const bounds = boundsFor(rows, terminalPoint);
    const map = new MapLibreMap({
      container: containerRef.current,
      style: territoryRasterStyle,
      center: centerFor(bounds),
      zoom: 7,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.resize();
      map.fitBounds(bounds, { padding: 64, maxZoom: 10, duration: 0 });
      const rankedRows = [...rows].sort(
        (left, right) => territoryWorkload(right) - territoryWorkload(left),
      );
      const zipMarkers = rankedRows.map((row, rank) => {
        const workload = territoryWorkload(row);
        const marker = document.createElement("button");
        marker.className = styles.zipMapMarker;
        marker.type = "button";
        marker.textContent = row.zip_code;
        marker.title = `${row.zip_code} · ${workload.toLocaleString()} observed stops`;
        marker.setAttribute("aria-label", marker.title);
        marker.style.color = rucaColors[row.ruca_category ?? "UNKNOWN"] ?? rucaColors.UNKNOWN;
        marker.style.fontSize = `${10 + 10 * Math.sqrt(workload / maxWorkload)}px`;
        marker.style.zIndex = String(rankedRows.length - rank);
        new Marker({ element: marker, anchor: "center" })
          .setLngLat([zipNumber(row.longitude), zipNumber(row.latitude)])
          .setPopup(new Popup({ offset: 12, closeButton: false }).setDOMContent(popupContent(row)))
          .addTo(map);
        return { marker, rank };
      });
      const updateZipVisibility = () => {
        const zoom = map.getZoom();
        const visibleCount = zoom < 7 ? 8 : zoom < 8 ? 14 : rankedRows.length;
        for (const item of zipMarkers) {
          item.marker.style.display = item.rank < visibleCount ? "block" : "none";
        }
      };
      updateZipVisibility();
      map.on("zoom", updateZipVisibility);

      if (terminalPoint) {
        const marker = document.createElement("div");
        marker.className = styles.mapTerminal;
        marker.title = terminal.terminal_name ?? "Terminal";
        const terminalIcon = document.createElement("strong");
        terminalIcon.textContent = "T";
        const terminalLabel = document.createElement("span");
        terminalLabel.textContent = "Terminal";
        marker.append(terminalIcon, terminalLabel);
        new Marker({ element: marker })
          .setLngLat([terminalPoint.longitude, terminalPoint.latitude])
          .setPopup(new Popup({ offset: 14 }).setText(
            `${terminal.terminal_name ?? "Terminal"} · ${terminal.matched_address ?? terminal.submitted_address ?? "Known location"}`,
          ))
          .addTo(map);
      }
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [rows, terminal, terminalPoint]);

  if (!rows.length) {
    return <div className={styles.emptyMap}>Known core ZIPs do not yet have mappable centroid references.</div>;
  }

  return (
    <div className={styles.mapShell}>
      <div aria-label="Interactive known ZIP service territory" className={styles.interactiveMap} ref={containerRef} role="region" />
      <button
        className={styles.resetMap}
        onClick={() => {
          if (mapRef.current && coreBounds) {
            mapRef.current.fitBounds(coreBounds, { padding: 64, maxZoom: 10, duration: 500 });
          }
        }}
        type="button"
      >
        Reset territory
      </button>
    </div>
  );
}
