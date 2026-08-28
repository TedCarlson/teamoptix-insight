"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
} from "maplibre-gl";
import {
  addInternalRoadLayers,
  applyInternalMapTheme,
  configureInternalMapWorker,
  createInternalMapStyle,
  currentInternalMapTheme,
  internalMapColors,
  observeInternalMapTheme,
} from "@/features/maps/internalMapStyle";
import type { RouteGpxPresentation } from "@/features/operations/manifests/routeGpxPresentation";
import styles from "./RouteGpxMap.module.css";

const statusColors = {
  OPEN: "#facc15",
  ATTEMPTED: "#f97316",
  CLOSED: "#16a34a",
  UNKNOWN: "#64748b",
} as const;

const stopBorders = {
  EXPRESS: "#9a3412",
  PICKUP: "#1d4ed8",
  DELIVERY: "#fff",
  UNKNOWN: "#334155",
} as const;

function popupContent(properties: {
  stopType: string;
  executionStatus: string;
  stopCount: number;
  firstSequence: number;
  lastSequence: number;
  observedAt: string | null;
}) {
  const root = document.createElement("div");
  root.className = styles.popup;
  const title = document.createElement("strong");
  title.textContent = `${properties.stopType.toLowerCase()} cluster`;
  const status = document.createElement("span");
  status.textContent = `${properties.executionStatus.toLowerCase()} · ${properties.stopCount} stop${properties.stopCount === 1 ? "" : "s"}`;
  const sequence = document.createElement("small");
  sequence.textContent = properties.firstSequence === properties.lastSequence
    ? `Route sequence ${properties.firstSequence}`
    : `Route sequence ${properties.firstSequence}–${properties.lastSequence}`;
  root.append(title, status, sequence);
  if (properties.observedAt) {
    const observed = document.createElement("small");
    observed.textContent = `Last evidence ${properties.observedAt}`;
    root.append(observed);
  }
  return root;
}

export default function RouteGpxMap({
  slug,
  routeGpx,
}: {
  slug: string;
  routeGpx: RouteGpxPresentation;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusCounts = useMemo(
    () =>
      routeGpx.stop_clusters.reduce(
        (counts, cluster) => {
          counts[cluster.execution_status] += cluster.stop_count;
          return counts;
        },
        { OPEN: 0, ATTEMPTED: 0, CLOSED: 0, UNKNOWN: 0 }
      ),
    [routeGpx.stop_clusters]
  );

  useEffect(() => {
    if (!containerRef.current || !routeGpx.stop_clusters.length) return;
    const coordinates = [
      ...routeGpx.path.map((point) => [point.longitude, point.latitude] as [number, number]),
      ...routeGpx.stop_clusters.map((cluster) => [cluster.longitude, cluster.latitude] as [number, number]),
    ];
    const pathCoordinates = routeGpx.path.map(
      (point) => [point.longitude, point.latitude] as [number, number]
    );
    const bounds = coordinates.reduce(
      (result, coordinate) => result.extend(coordinate),
      new LngLatBounds(coordinates[0], coordinates[0])
    );
    configureInternalMapWorker();
    const mapTheme = currentInternalMapTheme();
    const mapColors = internalMapColors(mapTheme);
    const map = new MapLibreMap({
      container: containerRef.current,
      style: createInternalMapStyle(mapTheme),
      center: bounds.getCenter(),
      zoom: 12,
      attributionControl: false,
      cooperativeGestures: true,
    });
    const stopObservingTheme = observeInternalMapTheme(map);
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.resize();
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
    const addRoutePath = () => {
      addInternalRoadLayers(map, slug, window.location.origin);
      if (pathCoordinates.length >= 2) {
        map.addSource("route-path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: pathCoordinates,
            },
          },
        });
        map.addLayer({
          id: "route-path-shadow",
          type: "line",
          source: "route-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": mapColors.routeCasing, "line-width": 10, "line-opacity": 0.94 },
        });
        map.addLayer({
          id: "route-path-line",
          type: "line",
          source: "route-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": mapColors.routeLine, "line-width": 5, "line-opacity": 0.98 },
        });
        applyInternalMapTheme(map, currentInternalMapTheme());
      }
    };
    map.on("error", (event) => {
      console.error("Route map rendering failed.", event.error);
    });
    let styleFrame: number | null = null;
    const installWhenStyleReady = () => {
      if (map.isStyleLoaded()) {
        addRoutePath();
        return;
      }
      styleFrame = window.requestAnimationFrame(installWhenStyleReady);
    };
    installWhenStyleReady();

    for (const cluster of routeGpx.stop_clusters) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = styles.marker;
      marker.textContent = String(cluster.first_sequence);
      marker.title = `${cluster.stop_type.toLowerCase()} · ${cluster.execution_status.toLowerCase()} · route sequence ${cluster.first_sequence}`;
      marker.setAttribute("aria-label", marker.title);
      marker.style.setProperty("--route-marker-fill", statusColors[cluster.execution_status]);
      marker.style.setProperty("--route-marker-border", stopBorders[cluster.stop_type]);
      const size = Math.min(38, 24 + Math.sqrt(cluster.stop_count) * 3);
      marker.style.width = `${size}px`;
      marker.style.height = `${size}px`;
      const popup = new Popup({ offset: 14 }).setDOMContent(
        popupContent({
          stopType: cluster.stop_type,
          executionStatus: cluster.execution_status,
          stopCount: cluster.stop_count,
          firstSequence: cluster.first_sequence,
          lastSequence: cluster.last_sequence,
          observedAt: cluster.status_observed_at_local,
        })
      );
      new Marker({ element: marker, anchor: "center" })
        .setLngLat([cluster.longitude, cluster.latitude])
        .setPopup(popup)
        .addTo(map);
    }

    return () => {
      if (styleFrame !== null) window.cancelAnimationFrame(styleFrame);
      stopObservingTheme();
      map.remove();
    };
  }, [routeGpx, slug]);

  if (!routeGpx.stop_clusters.length) {
    return <div className={styles.empty}>No GPX delivery clusters are available for this route and date.</div>;
  }

  return (
    <section className={styles.shell} aria-label="Interactive route delivery cluster map">
      <div className={styles.summary}>
        <span>{routeGpx.stop_clusters.length} locations</span>
        <span>{routeGpx.stop_point_count} route stops</span>
        <span>{statusCounts.CLOSED} completed</span>
        <span>{statusCounts.OPEN} open</span>
      </div>
      <div className={styles.map} ref={containerRef} role="region" aria-label="Route stop map" />
      <div className={styles.legend} aria-label="Map legend">
        {Object.entries(statusColors).map(([status, color]) => (
          <span key={status}>
            <i className={styles.dot} style={{ "--route-map-dot": color } as CSSProperties} />
            {status.toLowerCase()}
          </span>
        ))}
      </div>
      <p className={styles.note}>Circle border: orange express · blue pickup · white regular delivery. Select a marker for route sequence and status. Roads are served from TeamOptix-controlled Census reference data; route coordinates remain inside TeamOptix.</p>
    </section>
  );
}
