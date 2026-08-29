"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Maximize2 } from "lucide-react";
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
import type { RouteGpxExecutionCluster } from "@/features/operations/manifests/routeGpxPresentation";
import styles from "./RouteGpxMap.module.css";

const statusColors = {
  OPEN: "#facc15",
  ATTEMPTED: "#f97316",
  CLOSED: "#16a34a",
  UNKNOWN: "#64748b",
} as const;

const statusTextColors = {
  OPEN: "#172033",
  ATTEMPTED: "#2f1508",
  CLOSED: "#071c0e",
  UNKNOWN: "#f8fafc",
} as const;

const stopBorders = {
  EXPRESS: "#9a3412",
  PICKUP: "#1d4ed8",
  DELIVERY: "#fff",
  UNKNOWN: "#334155",
} as const;

export type RouteMapStopDetail = {
  title: string;
  address: string;
  window: string;
  outcome: string;
  evidence: string;
  statusCodes: string[];
  packageReferences: string[];
  serviceFlags: string[];
};

function popupContent(properties: {
  stopType: string;
  executionStatus: string;
  stopCount: number;
  firstSequence: number;
  lastSequence: number;
  observedAt: string | null;
  packageCount: number;
  manifestLinked: boolean;
  privateDetail?: RouteMapStopDetail;
}) {
  const root = document.createElement("div");
  root.className = styles.popup;
  const title = document.createElement("strong");
  title.textContent = properties.privateDetail?.title ?? (
    properties.firstSequence === properties.lastSequence
      ? `Stop ${properties.firstSequence} · ${properties.stopType.toLowerCase()}`
      : `Stops ${properties.firstSequence}–${properties.lastSequence} · ${properties.stopType.toLowerCase()}`
  );
  const status = document.createElement("span");
  if (properties.privateDetail) status.className = styles.popupOutcome;
  status.textContent = properties.privateDetail?.outcome ??
    `${properties.executionStatus.toLowerCase()} · ${properties.stopCount} stop${properties.stopCount === 1 ? "" : "s"}`;
  const sequence = document.createElement("small");
  const routeSequence = properties.firstSequence === properties.lastSequence
    ? String(properties.firstSequence)
    : `${properties.firstSequence}–${properties.lastSequence}`;
  sequence.textContent = [
    properties.stopType.toLowerCase(),
    `route sequence ${routeSequence}`,
    `${properties.packageCount} package${properties.packageCount === 1 ? "" : "s"}`,
    properties.stopCount > 1 ? `${properties.stopCount} co-located stops` : "",
  ].filter(Boolean).join(" · ");
  root.append(title, status, sequence);
  if (properties.privateDetail) {
    const detail = document.createElement("div");
    detail.className = styles.popupDetail;
    const address = document.createElement("span");
    address.textContent = properties.privateDetail.address || "Address unavailable";
    const window = document.createElement("small");
    window.textContent = `Window ${properties.privateDetail.window}`;
    const evidence = document.createElement("small");
    evidence.textContent = properties.privateDetail.evidence;
    detail.append(address, window, evidence);
    if (properties.privateDetail.statusCodes.length) {
      const codes = document.createElement("small");
      codes.textContent = `Status evidence · ${properties.privateDetail.statusCodes.join(" · ")}`;
      detail.append(codes);
    }
    if (properties.privateDetail.packageReferences.length) {
      const references = document.createElement("small");
      references.textContent = `Package${properties.privateDetail.packageReferences.length === 1 ? "" : "s"} · ${properties.privateDetail.packageReferences.join(" · ")}`;
      detail.append(references);
    }
    if (properties.privateDetail.serviceFlags.length) {
      const flags = document.createElement("small");
      flags.textContent = properties.privateDetail.serviceFlags.join(" · ");
      detail.append(flags);
    }
    root.append(detail);
  } else {
    const linkState = document.createElement("small");
    linkState.textContent = properties.manifestLinked
      ? "Manifest detail is linked but unavailable in this view."
      : "No manifest row is linked to this waypoint.";
    root.append(linkState);
  }
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
  selectedClusterKey = null,
  onClusterSelect,
  compact = false,
  stopDetailsByRef = {},
}: {
  slug: string;
  routeGpx: RouteGpxPresentation;
  selectedClusterKey?: string | null;
  onClusterSelect?: (cluster: RouteGpxExecutionCluster) => void;
  compact?: boolean;
  stopDetailsByRef?: Record<string, RouteMapStopDetail>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const routeBoundsRef = useRef<LngLatBounds | null>(null);
  const markersRef = useRef(
    new Map<
      string,
      {
        element: HTMLButtonElement;
        marker: Marker;
        popup: Popup;
        coordinates: [number, number];
      }
    >()
  );
  const selectRef = useRef(onClusterSelect);
  useEffect(() => {
    selectRef.current = onClusterSelect;
  }, [onClusterSelect]);
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
    const markerElements = new Map<
      string,
      {
        element: HTMLButtonElement;
        marker: Marker;
        popup: Popup;
        coordinates: [number, number];
      }
    >();
    markersRef.current = markerElements;
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
    routeBoundsRef.current = bounds;
    configureInternalMapWorker();
    const mapTheme = currentInternalMapTheme();
    const mapColors = internalMapColors(mapTheme);
    const map = new MapLibreMap({
      container: containerRef.current,
      style: createInternalMapStyle(mapTheme, window.location.origin),
      center: bounds.getCenter(),
      zoom: 12,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    mapRef.current = map;
    let resizeFrame: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        if (mapRef.current === map) map.resize();
      });
    });
    resizeObserver.observe(containerRef.current);
    const mapRequest = new AbortController();
    const stopObservingTheme = observeInternalMapTheme(map, window.location.origin);
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.resize();
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
    const addRoutePath = async () => {
      const reference = await addInternalRoadLayers(
        map,
        slug,
        window.location.origin,
        mapRequest.signal,
      );
      if (reference === "aborted") return;
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
          paint: { "line-color": mapColors.routeCasing, "line-width": 6, "line-opacity": 0.78 },
        });
        map.addLayer({
          id: "route-path-line",
          type: "line",
          source: "route-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": mapColors.routeLine, "line-width": 2.75, "line-opacity": 0.94 },
        });
        applyInternalMapTheme(map, currentInternalMapTheme(), window.location.origin);
      }
    };
    map.on("error", (event) => {
      console.error("Route map rendering failed.", event.error);
    });
    let styleFrame: number | null = null;
    const installWhenStyleReady = () => {
      if (map.isStyleLoaded()) {
        void addRoutePath().catch((error) => {
          if (!mapRequest.signal.aborted) console.error("Route reference map failed.", error);
        });
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
      marker.setAttribute("aria-expanded", "false");
      marker.dataset.clusterKey = cluster.cluster_key;
      marker.dataset.selected = "false";
      marker.style.setProperty("--route-marker-fill", statusColors[cluster.execution_status]);
      marker.style.setProperty("--route-marker-border", stopBorders[cluster.stop_type]);
      marker.style.setProperty("--route-marker-text", statusTextColors[cluster.execution_status]);
      const size = Math.min(32, 24 + Math.sqrt(cluster.stop_count) * 2);
      marker.style.width = `${size}px`;
      marker.style.height = `${size}px`;
      const coordinates: [number, number] = [cluster.longitude, cluster.latitude];
      const popup = new Popup({ offset: 14, closeOnClick: false }).setDOMContent(
        popupContent({
          stopType: cluster.stop_type,
          executionStatus: cluster.execution_status,
          stopCount: cluster.stop_count,
          firstSequence: cluster.first_sequence,
          lastSequence: cluster.last_sequence,
          observedAt: cluster.status_observed_at_local,
          packageCount: cluster.package_count,
          manifestLinked: cluster.manifest_linked,
          privateDetail: cluster.manifest_ref
            ? stopDetailsByRef[cluster.manifest_ref]
            : undefined,
        })
      );
      popup.on("open", () => {
        marker.dataset.active = "true";
        marker.setAttribute("aria-expanded", "true");
      });
      popup.on("close", () => {
        delete marker.dataset.active;
        marker.setAttribute("aria-expanded", "false");
      });
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        markerElements.forEach((entry) => {
          if (entry.popup !== popup && entry.popup.isOpen()) entry.popup.remove();
        });
        if (!popup.isOpen()) popup.setLngLat(coordinates).addTo(map);
        selectRef.current?.(cluster);
      });
      const mapMarker = new Marker({ element: marker, anchor: "center" })
        .setLngLat(coordinates)
        .addTo(map);
      markerElements.set(cluster.cluster_key, {
        element: marker,
        marker: mapMarker,
        popup,
        coordinates,
      });
    }

    return () => {
      mapRequest.abort();
      resizeObserver.disconnect();
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      if (styleFrame !== null) window.cancelAnimationFrame(styleFrame);
      stopObservingTheme();
      markerElements.clear();
      if (markersRef.current === markerElements) markersRef.current = new Map();
      if (mapRef.current === map) mapRef.current = null;
      if (routeBoundsRef.current === bounds) routeBoundsRef.current = null;
      map.remove();
    };
  }, [routeGpx, slug, stopDetailsByRef]);

  useEffect(() => {
    markersRef.current.forEach((entry, clusterKey) => {
      const selected = clusterKey === selectedClusterKey;
      entry.element.dataset.selected = String(selected);
      if (!selected && entry.popup.isOpen()) entry.popup.remove();
    });
    if (!selectedClusterKey) return;
    const entry = markersRef.current.get(selectedClusterKey);
    const map = mapRef.current;
    if (!entry || !map) return;
    map.easeTo({
      center: entry.coordinates,
      zoom: Math.max(map.getZoom(), 12.5),
      duration: 420,
    });
    if (!entry.popup.isOpen()) entry.popup.setLngLat(entry.coordinates).addTo(map);
  }, [selectedClusterKey]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [compact]);

  if (!routeGpx.stop_clusters.length) {
    return <div className={styles.empty}>No GPX delivery clusters are available for this route and date.</div>;
  }

  function fitEntireRoute() {
    const map = mapRef.current;
    const bounds = routeBoundsRef.current;
    if (!map || !bounds) return;
    markersRef.current.forEach((entry) => entry.popup.remove());
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 420 });
  }

  return (
    <section className={styles.shell} aria-label="Interactive route delivery cluster map">
      <div className={styles.summary}>
        <span>{routeGpx.stop_clusters.length} locations</span>
        <span>{routeGpx.stop_point_count} route stops</span>
        <span>{statusCounts.CLOSED} completed</span>
        <span>{statusCounts.OPEN} open</span>
        <span>{statusCounts.ATTEMPTED} attempted</span>
        <span>{statusCounts.UNKNOWN} unknown</span>
      </div>
      <div className={styles.mapFrame}>
        <button
          type="button"
          className={styles.fitRoute}
          aria-label="Fit entire route"
          title="Fit entire route"
          onClick={fitEntireRoute}
        >
          <Maximize2 size={15} aria-hidden="true" />
        </button>
        <div className={`${styles.map} ${compact ? styles.mapCompact : ""}`} ref={containerRef} role="region" aria-label="Route stop map" />
      </div>
      <div className={styles.legend} aria-label="Map legend">
        {Object.entries(statusColors).map(([status, color]) => (
          <span key={status}>
            <i className={styles.dot} style={{ "--route-map-dot": color } as CSSProperties} />
            {status.toLowerCase()}
          </span>
        ))}
      </div>
      <p className={styles.note}>Circle border: orange express · blue pickup · white regular delivery. Waypoint geometry is de-identified. Authorized manifest detail is joined only after selection and is never sent to the regional basemap.</p>
    </section>
  );
}
