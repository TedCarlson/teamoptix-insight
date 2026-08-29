"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { List } from "lucide-react";
import { manifestDetailRequestUrl } from "@/features/operations/manifests/routeEvidence";
import type { RouteGpxPresentation } from "@/features/operations/manifests/routeGpxPresentation";
import {
  manifestDeliveryStopTitle,
  manifestPickupStopTitle,
} from "@/features/operations/manifests/manifestDrawerIdentity";
import type { ManifestIdentityAccess } from "@/features/operations/manifests/manifestIdentityAccess";
import type { FccRouteSignalRow } from "@/features/operations/delivery-window/lib/fccRouteHealth";
import type { DroPlanRow } from "@/features/operations/delivery-window/lib/serviceRouteEvidence";
import type { ManifestCollectionPace } from "@/features/operations/manifests/manifestCollectionPace";
import type { RouteGpxExecutionCluster } from "@/features/operations/manifests/routeGpxPresentation";
import type { RouteMapStopDetail } from "./RouteGpxMap";
import styles from "./RouteHealthOverlay.module.css";

const RouteGpxMapView = dynamic(() => import("./RouteGpxMap"), {
  ssr: false,
  loading: () => (
    <p style={{ color: "#64748b", fontWeight: 800 }}>Preparing interactive map…</p>
  ),
});

export type RouteHealthOverlayView = "detail" | "map";

export type ManifestRouteHealthCard = {
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  capture_plan_route_id: string;
  status: string;
  severity: string;
  flags: Record<string, unknown>;
  artifacts: {
    total: number;
    delivery_count: number;
    pickup_count: number;
    delivery_status: string | null;
    pickup_status: string | null;
    latest_captured_at: string | null;
    latest_processed_at: string | null;
  };
  delivery: {
    stop_count: number;
    completed_stop_count: number;
    incomplete_stop_count: number;
    package_count: number;
  };
  express: {
    package_count: number;
    stop_count: number;
    complete_package_count: number;
    attempted_package_count: number;
    open_package_count: number;
    data_health: {
      tracking_identity_missing_count: number;
      stop_link_missing_count: number;
      stop_link_ambiguous_count: number;
      reference_match_available: boolean;
    };
    residential_package_count: number;
    signature_package_count: number;
    hazmat_package_count: number;
    collection_package_count: number;
  };
  pickup: {
    stop_count: number;
    expected_package_count: number;
    actual_package_count: number;
    earliest_ready_time: string | null;
    latest_close_time: string | null;
  };
};

type Props = {
  open: boolean;
  slug: string;
  serviceDate: string;
  routeLabel: string;
  routeKey: string;
  health: ManifestRouteHealthCard | null;
  dsw: {
    planned_delivery_stops: number;
    actual_delivery_stops: number;
    vscan_packages: number;
    actual_delivery_packages: number;
    planned_pickup_stops: number;
    actual_pickup_stops: number;
    actual_pickup_packages: number;
    generated_at_text?: string | null;
    ils_percent?: number | string | null;
    miles?: number | null;
    driver_name?: string | null;
    vehicle_text?: string | null;
    authoritative_inventory_only?: boolean;
  } | null;
  initialView?: RouteHealthOverlayView;
  droAm?: DroPlanRow | null;
  droPm?: DroPlanRow | null;
  fcc?: FccRouteSignalRow | null;
  dispatchDriver?: string | null;
  onClose: () => void;
};

type RouteDetailPayload = {
  delivery_stops: Array<Record<string, unknown>>;
  packages: Array<Record<string, unknown>>;
  pickups: Array<Record<string, unknown>>;
  stop_clusters: RouteStopCluster[];
  route_gpx: RouteGpxPresentation | null;
  identity_access: ManifestIdentityAccess;
  collection_pace: ManifestCollectionPace;
  retention_mode?: "IDENTIFIABLE" | "DEIDENTIFIED";
  error?: string;
};

type RouteStopCluster = {
  cluster_key: string;
  postal_code_5: string | null;
  centroid_latitude: number | null;
  centroid_longitude: number | null;
  stop_count: number;
  delivery_stop_count: number;
  pickup_stop_count: number;
  completed_stop_count: number;
  package_count: number;
  express_stop_count: number;
  signature_stop_count: number;
  hazmat_stop_count: number;
  collection_stop_count: number;
  first_stop_sequence: number | null;
  last_stop_sequence: number | null;
  suppressed_location_count: number;
  is_location_suppressed: boolean;
};

const routeDetailCache = new Map<string, RouteDetailPayload>();
const routeDetailRequests = new Map<string, Promise<RouteDetailPayload>>();
const ROUTE_DETAIL_CACHE_LIMIT = 32;
const ROUTE_DETAIL_CACHE_VERSION = "v2";

function cacheRouteDetail(key: string, payload: RouteDetailPayload) {
  routeDetailCache.delete(key);
  routeDetailCache.set(key, payload);
  while (routeDetailCache.size > ROUTE_DETAIL_CACHE_LIMIT) {
    const oldestKey = routeDetailCache.keys().next().value;
    if (!oldestKey) break;
    routeDetailCache.delete(oldestKey);
  }
}

function routeDetailCacheKey(slug: string, serviceDate: string, routeKey: string) {
  return `${ROUTE_DETAIL_CACHE_VERSION}|${slug}|${serviceDate}|${routeKey}`;
}

async function fetchRouteDetail(params: {
  slug: string;
  serviceDate: string;
  routeKey: string;
}) {
  const cacheKey = routeDetailCacheKey(
    params.slug,
    params.serviceDate,
    params.routeKey
  );
  const cached = routeDetailCache.get(cacheKey);
  if (cached) return cached;
  const pending = routeDetailRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(manifestDetailRequestUrl(params), {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json()) as RouteDetailPayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load route detail.");
    }
    cacheRouteDetail(cacheKey, payload);
    return payload;
  })();
  routeDetailRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    routeDetailRequests.delete(cacheKey);
  }
}

export default function RouteHealthOverlay({
  open,
  slug,
  serviceDate,
  routeLabel,
  routeKey,
  health,
  dsw,
  droAm = null,
  droPm = null,
  fcc = null,
  dispatchDriver = null,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<RouteDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<RouteHealthOverlayView>("map");
  const [selectedManifestRef, setSelectedManifestRef] = useState<string | null>(null);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const warehouseRouteKey = health?.route_key ?? routeKey;
  const asOf =
    fcc?.export_generated_text ??
    dsw?.generated_at_text ??
    health?.artifacts.latest_processed_at ??
    null;

  useEffect(() => {
    if (open) {
      setActiveView("map");
      setSelectedManifestRef(null);
      setSelectedClusterKey(null);
    }
  }, [open, routeKey]);

  const manifestItems = useMemo(
    () => (detail ? buildCombinedManifest(detail) : []),
    [detail]
  );
  const mapStopDetailsByRef = useMemo(
    () => buildMapStopDetails(manifestItems),
    [manifestItems]
  );

  function selectCluster(cluster: RouteGpxExecutionCluster) {
    setSelectedClusterKey(cluster.cluster_key);
    if (cluster.manifest_ref) {
      setSelectedManifestRef(cluster.manifest_ref);
    }
  }

  function selectManifest(item: CombinedManifestItem) {
    const nextRef = selectedManifestRef && item.mapRefs.includes(selectedManifestRef)
      ? null
      : item.mapRefs[0] ?? item.key;
    setSelectedManifestRef(nextRef);
    const cluster = detail?.route_gpx?.stop_clusters.find((candidate) =>
      candidate.manifest_ref ? item.mapRefs.includes(candidate.manifest_ref) : false
    );
    setSelectedClusterKey(cluster?.cluster_key ?? null);
  }

  useEffect(() => {
    if (!open || !warehouseRouteKey) return;
    let active = true;
    const selectedRouteKey = warehouseRouteKey;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
      const cacheKey = routeDetailCacheKey(slug, serviceDate, selectedRouteKey);
      const cached = routeDetailCache.get(cacheKey);
      setDetail(cached ?? null);
      try {
        const payload = await fetchRouteDetail({
          slug,
          serviceDate,
          routeKey: selectedRouteKey,
        });
        if (!active) return;
        setDetail(payload);
      } catch (error) {
        if (active) {
          setDetail(null);
          setDetailError(error instanceof Error ? error.message : "Unable to load route detail.");
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      active = false;
    };
  }, [open, serviceDate, slug, warehouseRouteKey]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={activeView === "map" ? "Route Map" : "Route Health"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 85,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <section
        className={`operations-dialog-surface ${styles.drawer}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 4px",
                color: "#64748b",
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Service · Route evidence
            </p>
            <h2 style={{ margin: 0, fontSize: 22 }}>{routeLabel}</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, fontWeight: 800 }}>
              Service date {serviceDate}
            </p>
            <p style={{ margin: "3px 0 0", color: "#475569", fontSize: 12, fontWeight: 900 }}>
              As of {formatAsOf(asOf)}
            </p>
          </div>

          <button
            type="button"
            className="button"
            onClick={onClose}
            style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
          >
            Close
          </button>
        </header>

        <details className={styles.sourceDisclosure} hidden={activeView === "map"}>
          <summary>Route source reconciliation · DRO, DSW, manifest, and FCC</summary>
          <div className={styles.sourcePanel}>
            <RouteEvidenceLedger
              dispatchDriver={dispatchDriver}
              droAm={droAm}
              droPm={droPm}
              dsw={dsw}
              fcc={fcc}
              health={health}
            />
            <DswContract dsw={dsw} />
            <WarehouseManifestContract
              health={health}
              detail={detail}
              loading={detailLoading}
              routeKey={warehouseRouteKey}
            />
          </div>
        </details>
        <div className={`${styles.workspace} ${activeView === "map" ? styles.workspaceFull : ""}`}>
          <section className={styles.mapPanel} aria-label="Route map and collection pace">
            <button
              type="button"
              className={styles.manifestToggle}
              aria-pressed={activeView === "detail"}
              aria-label={activeView === "detail" ? "Hide manifest" : "Show manifest"}
              onClick={() => setActiveView((current) => current === "detail" ? "map" : "detail")}
            >
              <List size={14} aria-hidden="true" />
              Manifest
            </button>
            <RouteCollectionPace
              pace={detail?.collection_pace ?? null}
              compact={activeView === "map"}
            />
            {detailLoading ? (
              <p style={{ color: "#64748b", fontWeight: 800 }}>Loading route geometry…</p>
            ) : detailError ? (
              <p role="alert" style={{ color: "#b91c1c", fontWeight: 850 }}>{detailError}</p>
            ) : detail?.route_gpx ? (
              <RouteGpxMapView
                slug={slug}
                routeGpx={detail.route_gpx}
                selectedClusterKey={selectedClusterKey}
                onClusterSelect={selectCluster}
                compact={activeView === "detail"}
                stopDetailsByRef={mapStopDetailsByRef}
              />
            ) : detail?.stop_clusters.length ? (
              <RouteClusterEvidence
                clusters={detail.stop_clusters}
                loading={false}
                open
              />
            ) : (
              <div style={{ border: "1px dashed #94a3b8", borderRadius: 16, padding: 24, color: "#64748b", fontWeight: 850, textAlign: "center" }}>
                No retained GPX route geometry is available for this route and service date.
              </div>
            )}
          </section>
          <aside className={styles.manifestPanel} aria-label="Selectable route manifest" hidden={activeView === "map"}>
            <RouteManifestDetail
              detail={detail}
              dsw={dsw}
              loading={detailLoading}
              error={detailError}
              items={manifestItems}
              selectedRef={selectedManifestRef}
              onSelect={selectManifest}
              visible={activeView === "detail"}
            />
          </aside>
        </div>
      </section>
    </div>
  );
}

function terminalTime(input: string) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString([], {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RouteCollectionPace({
  pace,
  compact = false,
}: {
  pace: ManifestCollectionPace | null;
  compact?: boolean;
}) {
  if (!pace) return null;
  const measured = pace.intervals.filter(
    (interval) => interval.completed_since_prior !== null
  );
  const last = measured.at(-1) ?? null;
  const totalCompleted = measured.reduce(
    (sum, interval) => sum + Number(interval.completed_since_prior ?? 0),
    0
  );
  const elapsedMinutes = measured.reduce(
    (sum, interval) => sum + Number(interval.minutes_since_prior ?? 0),
    0
  );
  const averagePace = elapsedMinutes > 0
    ? Math.round((totalCompleted / elapsedMinutes) * 600) / 10
    : null;
  const maxDelta = Math.max(
    1,
    ...measured.map((interval) => Number(interval.completed_since_prior ?? 0))
  );
  const collectionWindow = pace.first_capture_at && pace.last_capture_at
    ? `${terminalTime(pace.first_capture_at)}–${terminalTime(pace.last_capture_at)}`
    : null;
  const medianCadence = Number(pace.median_cadence_minutes);
  const hasMedianCadence = Number.isFinite(medianCadence) && medianCadence > 0;

  if (!measured.length || compact) {
    return (
      <section className={styles.paceEmpty} aria-label="Manifest collection pace">
        <strong>Collection pace</strong>
        <span>{pace.capture_count} collection receipts</span>
        {collectionWindow ? <span>{collectionWindow}</span> : null}
        {hasMedianCadence ? (
          <span>{medianCadence} min median cadence</span>
        ) : null}
        {measured.length ? (
          <>
            <span>{averagePace ?? "—"} average stops/hr</span>
            <span>{last?.completed_since_prior ?? "—"} stops in latest block</span>
          </>
        ) : (
          <small>
            {pace.capture_count
              ? "Collection time is verified. Completion pace is pending the retained-file metadata backfill."
              : "No delivery-manifest collection receipts are available for this route and date."}
          </small>
        )}
      </section>
    );
  }

  return (
    <section className={styles.pacePanel} aria-label="Manifest collection pace">
      <div className={styles.paceHeader}>
        <div>
          <strong style={{ fontSize: 13 }}>Collection pace</strong>
          <div style={{ color: "#bfdbfe", fontSize: 10, marginTop: 2 }}>
            Route-level completion change between authoritative manifest captures
          </div>
        </div>
        <strong style={{ fontSize: 18 }}>
          {last?.stops_per_hour ?? "—"} <span style={{ fontSize: 10, color: "#bfdbfe" }}>stops/hr</span>
        </strong>
      </div>
      <div className={styles.paceStats}>
        <span>{pace.capture_count} collection receipts</span>
        <span>{pace.measured_capture_count} measured captures</span>
        {pace.first_capture_at && pace.last_capture_at ? (
          <span>{terminalTime(pace.first_capture_at)}–{terminalTime(pace.last_capture_at)}</span>
        ) : null}
        <span>{averagePace ?? "—"} average stops/hr</span>
        <span>{last?.completed_since_prior ?? "—"} stops in latest block</span>
      </div>
      <div className={styles.paceChart} aria-label="Stops completed per collection interval">
        {measured.map((interval) => {
          const delta = Number(interval.completed_since_prior ?? 0);
          return (
            <div
              key={interval.captured_at}
              className={styles.paceBar}
              style={{ height: `${Math.max(10, Math.round((delta / maxDelta) * 68))}px` }}
              title={`${delta} stops completed in ${interval.minutes_since_prior ?? "—"} minutes · ${interval.stops_per_hour ?? "—"} stops/hour`}
            >
              <strong>{delta}</strong>
              <span>{terminalTime(interval.captured_at)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatAsOf(input: string | null) {
  if (!input) return "—";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function comparableDriver(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z,\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.includes(",")) {
    const [last = "", rest = ""] = normalized.split(",");
    return `${last.trim()}|${rest.trim().split(" ")[0] ?? ""}`;
  }
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length > 1 ? `${parts.at(-1)}|${parts[0]}` : normalized;
}

function compactNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toFixed(1).replace(/\.0$/, "");
}

function RouteEvidenceLedger({
  dispatchDriver,
  droAm,
  droPm,
  dsw,
  fcc,
  health,
}: {
  dispatchDriver: string | null;
  droAm: DroPlanRow | null;
  droPm: DroPlanRow | null;
  dsw: Props["dsw"];
  fcc: FccRouteSignalRow | null;
  health: ManifestRouteHealthCard | null;
}) {
  const dro = droAm ?? droPm;
  const droFrame = droAm ? "AM" : droPm ? "PM" : null;
  const manifestPresent = Boolean(
    Number(health?.artifacts.total ?? 0) > 0 ||
      Number(health?.delivery.stop_count ?? 0) > 0 ||
      Number(health?.pickup.stop_count ?? 0) > 0
  );
  const inventoryOnly = dsw?.authoritative_inventory_only === true;
  const cards = [
    {
      source: "DRO",
      authority: "Plan",
      present: Boolean(dro),
      value: dro
        ? `${droFrame} · ${Number(dro.stops ?? 0)} stops · ${Number(dro.packages ?? 0)} packages`
        : "No selected-day route plan",
      detail: dro
        ? `${compactNumber(dro.miles)} miles · ${compactNumber(dro.planned_time)} planned hours · ${Number(dro.time_commits ?? 0)} time critical`
        : "AM and PM frames checked",
    },
    {
      source: "DSW",
      authority: "Execution",
      present: Boolean(dsw),
      value: dsw
        ? `${dsw.actual_delivery_stops}/${dsw.planned_delivery_stops} stops · ${dsw.actual_delivery_packages}${!inventoryOnly && Number(dsw.vscan_packages ?? 0) > 0 ? `/${dsw.vscan_packages}` : " delivered"} packages`
        : "No selected-day execution row",
      detail: dsw
        ? inventoryOnly
          ? "FINAL route inventory · package plan and pickup detail are not repeated here"
          : `${dsw.actual_pickup_stops}/${dsw.planned_pickup_stops} pickups · ${dsw.actual_pickup_packages} pickup packages`
        : "No DSW totals available",
    },
    {
      source: "Manifest",
      authority: "Intended stops",
      present: manifestPresent,
      value: manifestPresent
        ? `${Number(health?.delivery.stop_count ?? 0)} stops · ${Number(health?.delivery.package_count ?? 0)} packages`
        : "No warehouse manifest rows",
      detail: manifestPresent
        ? `${Number(health?.pickup.stop_count ?? 0)} pickup stops · ${Number(health?.express.package_count ?? 0)} Express packages`
        : "Delivery and pickup artifacts checked",
    },
    {
      source: "FCC",
      authority: "Closeout",
      present: Boolean(fcc),
      value: fcc
        ? fcc.final_stop_time
          ? `Final stop ${fcc.final_stop_time}`
          : fcc.last_delivery_time
            ? `Last delivery ${fcc.last_delivery_time}`
            : "Route row present"
        : "No selected-day closeout row",
      detail: fcc
        ? [
            fcc.last_pickup_time ? `Last pickup ${fcc.last_pickup_time}` : null,
            fcc.last_transmission_time ? `Transmission ${fcc.last_transmission_time}` : null,
          ].filter(Boolean).join(" · ") || "No activity timestamp reported"
        : "FCC route signal unavailable",
    },
  ];
  const conflicts: string[] = [];
  const droStops = Number(dro?.stops ?? 0);
  const dswPlannedStops = Number(dsw?.planned_delivery_stops ?? 0);
  const manifestStops = Number(health?.delivery.stop_count ?? 0);

  if (dro && dsw && droStops > 0 && dswPlannedStops > 0 && droStops !== dswPlannedStops) {
    conflicts.push(`Planned stops differ: DRO ${droStops} · DSW ${dswPlannedStops}.`);
  }
  if (manifestPresent && dsw && manifestStops > 0 && dswPlannedStops > 0 && manifestStops !== dswPlannedStops) {
    conflicts.push(`Route volume differs: Manifest ${manifestStops} stops · DSW ${dswPlannedStops} planned.`);
  }
  if (
    fcc?.deliveries_complete &&
    dsw &&
    Number(dsw.actual_delivery_stops ?? 0) < dswPlannedStops
  ) {
    conflicts.push(
      `FCC marks deliveries complete while DSW reports ${dsw.actual_delivery_stops}/${dswPlannedStops} stops.`
    );
  }

  const driverSources = [
    ["Dispatch", dispatchDriver],
    ["DSW", dsw?.driver_name],
    ["FCC", fcc?.driver_name],
  ] as const;
  const driverIdentities = new Set(
    driverSources.map(([, value]) => comparableDriver(value)).filter(Boolean)
  );
  if (driverIdentities.size > 1) {
    conflicts.push(
      `Driver identity differs across ${driverSources
        .filter(([, value]) => Boolean(comparableDriver(value)))
        .map(([source]) => source)
        .join(", ")}.`
    );
  }

  const represented = cards.filter((card) => card.present).length;

  return (
    <section
      aria-label="Route source ledger"
      style={{
        border: "1px solid #dbe4ef",
        borderRadius: 14,
        background: "#fff",
        padding: 12,
        display: "grid",
        gap: 9,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 14 }}>Selected-day source ledger</strong>
          <small style={{ color: "#64748b", fontWeight: 800 }}>
            Each source keeps its own authority; disagreements remain visible.
          </small>
        </span>
        <strong
          style={{
            alignSelf: "start",
            borderRadius: 999,
            background: represented === 4 ? "#ecfdf5" : "#fffbeb",
            color: represented === 4 ? "#166534" : "#92400e",
            padding: "5px 8px",
            fontSize: 10,
          }}
        >
          {represented} / 4 sources
        </strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 7 }}>
        {cards.map((card) => (
          <div
            key={card.source}
            style={{
              border: `1px solid ${card.present ? "#bfdbfe" : "#e5e7eb"}`,
              borderRadius: 11,
              background: card.present ? "#f8fbff" : "#f8fafc",
              padding: 9,
              display: "grid",
              gap: 3,
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ color: card.present ? "#1d4ed8" : "#94a3b8", fontSize: 10 }}>
                {card.source}
              </strong>
              <small style={{ color: "#64748b", fontSize: 8, fontWeight: 900 }}>
                {card.authority}
              </small>
            </span>
            <strong style={{ color: card.present ? "#0f172a" : "#94a3b8", fontSize: 11 }}>
              {card.value}
            </strong>
            <small style={{ color: "#64748b", fontSize: 9, fontWeight: 800 }}>
              {card.detail}
            </small>
          </div>
        ))}
      </div>

      <div
        style={{
          border: `1px solid ${conflicts.length ? "#fecaca" : "#bbf7d0"}`,
          borderRadius: 10,
          background: conflicts.length ? "#fef2f2" : "#f0fdf4",
          color: conflicts.length ? "#991b1b" : "#166534",
          padding: "8px 9px",
          display: "grid",
          gap: 3,
          fontSize: 10,
          fontWeight: 900,
        }}
      >
        {conflicts.length
          ? conflicts.map((conflict) => <span key={conflict}>{conflict}</span>)
          : <span>No cross-source conflict detected in comparable facts.</span>}
      </div>
    </section>
  );
}

function WarehouseManifestContract({
  health,
  detail,
  loading,
  routeKey,
}: {
  health: ManifestRouteHealthCard | null;
  detail: RouteDetailPayload | null;
  loading: boolean;
  routeKey: string;
}) {
  const deliveryRows = detail?.delivery_stops.length ?? 0;
  const packageRows = detail?.packages.length ?? 0;
  const pickupRows = detail?.pickups.length ?? 0;
  const hasWarehouseRows = deliveryRows + packageRows + pickupRows > 0;

  return (
    <div
      style={{
        border: `1px solid ${hasWarehouseRows ? "#86efac" : "#dbe4ef"}`,
        borderRadius: 14,
        background: hasWarehouseRows ? "#f0fdf4" : "#fff",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 14 }}>Authoritative warehouse read</strong>
          <small style={{ color: "#64748b", fontWeight: 850 }}>
            Exact route {routeKey || "unresolved"}; route-health linkage is not required.
          </small>
        </span>
        <strong
          style={{
            alignSelf: "start",
            borderRadius: 999,
            background: hasWarehouseRows ? "#dcfce7" : "#f1f5f9",
            color: hasWarehouseRows ? "#166534" : "#475569",
            padding: "5px 8px",
            fontSize: 10,
          }}
        >
          {loading ? "READING" : hasWarehouseRows ? "ROWS PRESENT" : "NO ROWS"}
        </strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {[
          ["Delivery stops", deliveryRows, health?.artifacts.delivery_status],
          ["Packages", packageRows, health?.artifacts.delivery_status],
          ["Pickup stops", pickupRows, health?.artifacts.pickup_status],
        ].map(([label, count, status]) => (
          <span
            key={String(label)}
            style={{
              border: "1px solid #dbe4ef",
              borderRadius: 10,
              background: "#fff",
              padding: 8,
              display: "grid",
              gap: 2,
            }}
          >
            <small style={{ color: "#64748b", fontSize: 9, fontWeight: 950 }}>
              {label}
            </small>
            <strong style={{ fontSize: 13 }}>{String(count)}</strong>
            <small style={{ color: "#475569", fontSize: 9, fontWeight: 850 }}>
              {String(status ?? (Number(count) > 0 ? "NORMALIZED" : "NOT PRESENT"))}
            </small>
          </span>
        ))}
      </div>

      {!health && hasWarehouseRows ? (
        <small style={{ color: "#166534", fontWeight: 850 }}>
          Warehouse rows were found even though the route-health summary has not linked yet.
        </small>
      ) : null}
    </div>
  );
}

function mapCoordinate(value: number, min: number, max: number) {
  if (min === max) return 50;
  return ((value - min) / (max - min)) * 78 + 11;
}

function RouteClusterEvidence({
  clusters,
  loading,
  open = false,
}: {
  clusters: RouteStopCluster[];
  loading: boolean;
  open?: boolean;
}) {
  const centroidPoints = useMemo(
    () =>
      clusters.filter(
        (cluster) =>
          typeof cluster.centroid_latitude === "number" &&
          typeof cluster.centroid_longitude === "number" &&
          !cluster.is_location_suppressed
      ),
    [clusters]
  );
  const mappedPoints = useMemo(
    () => centroidPoints.map((cluster) => ({
      latitude: cluster.centroid_latitude as number,
      longitude: cluster.centroid_longitude as number,
    })),
    [centroidPoints]
  );
  const bounds = useMemo(() => {
    const latitudes = mappedPoints.map((point) => point.latitude);
    const longitudes = mappedPoints.map((point) => point.longitude);
    return {
      minLatitude: Math.min(...latitudes),
      maxLatitude: Math.max(...latitudes),
      minLongitude: Math.min(...longitudes),
      maxLongitude: Math.max(...longitudes),
    };
  }, [mappedPoints]);
  if (loading) return null;

  return (
    <details
      open={open}
      style={{
        border: "1px solid #bfdbfe",
        borderRadius: 14,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          padding: 12,
          display: "grid",
          gap: 3,
          listStyle: "none",
        }}
      >
        <strong>
          Route geography · {clusters.length} stop clusters
        </strong>
        <small style={{ color: "#64748b", fontWeight: 800 }}>
          Privacy-safe ZIP-centroid fallback; exact route geometry has not been collected for this route and date.
        </small>
      </summary>

      <div style={{ borderTop: "1px solid #dbeafe", padding: 12, display: "grid", gap: 10 }}>
        <div
          aria-label="Route stop cluster map preview"
          style={{
            position: "relative",
            minHeight: 220,
            border: "1px solid #cbd5e1",
            borderRadius: 14,
            background:
              "radial-gradient(circle at 22% 24%, rgba(59, 130, 246, 0.14), transparent 26%), linear-gradient(135deg, #e0f2fe, #f8fafc 58%, #ecfdf5)",
            overflow: "hidden",
          }}
        >
          {mappedPoints.length === 0 ? (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 18,
                textAlign: "center",
                color: "#64748b",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {clusters.length
                ? "Cluster counts are retained, but mappable coordinates are suppressed or unavailable."
                : "No route cluster evidence is available for this route and date."}
            </span>
          ) : null}

          {centroidPoints.map((cluster) => {
            const x = mapCoordinate(
              cluster.centroid_longitude as number,
              bounds.minLongitude,
              bounds.maxLongitude
            );
            const y =
              100 -
              mapCoordinate(
                cluster.centroid_latitude as number,
                bounds.minLatitude,
                bounds.maxLatitude
              );
            const size = Math.min(28, 10 + Math.sqrt(cluster.stop_count) * 2.5);
            return (
              <span
                key={cluster.cluster_key}
                title={`ZIP ${cluster.postal_code_5 ?? "suppressed"} · ${cluster.stop_count} stops · ${cluster.package_count} packages`}
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%, -50%)",
                  width: size,
                  height: size,
                  border: "2px solid #fff",
                  borderRadius: 999,
                  background: cluster.express_stop_count > 0 ? "#f97316" : "#0f766e",
                  boxShadow: "0 7px 18px rgba(15, 23, 42, 0.24)",
                }}
              />
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {clusters.map((cluster) => (
            <span
              key={`label-${cluster.cluster_key}`}
              style={{
                border: "1px solid #dbe4ef",
                borderRadius: 999,
                background: "#f8fafc",
                color: "#334155",
                padding: "5px 8px",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {cluster.is_location_suppressed
                ? `${cluster.suppressed_location_count} suppressed locations`
                : `ZIP ${cluster.postal_code_5 ?? "—"}`} · {cluster.stop_count} stops · {cluster.package_count} pkg
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}

function DswContract({ dsw }: { dsw: Props["dsw"] }) {
  if (!dsw) return null;
  const inventoryOnly = dsw.authoritative_inventory_only === true;
  const ilsText = String(dsw.ils_percent ?? "").replace("%", "").trim();
  const ilsRaw = Number(ilsText);
  const ils = ilsText && Number.isFinite(ilsRaw)
    ? `${(ilsRaw <= 1 ? ilsRaw * 100 : ilsRaw).toFixed(1).replace(/\.0$/, "")}%`
    : "—";
  const facts = [
    { label: "Stops", value: `${dsw.actual_delivery_stops} / ${dsw.planned_delivery_stops}`, color: "#16a34a", bg: "#ecfdf5" },
    { label: "Packages", value: inventoryOnly ? `${dsw.actual_delivery_packages} delivered` : `${dsw.actual_delivery_packages} / ${dsw.vscan_packages}`, color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Pickups", value: inventoryOnly ? "See DSW summary" : `${dsw.actual_pickup_stops} / ${dsw.planned_pickup_stops}`, color: "#2563eb", bg: "#eff6ff" },
    { label: "Pickup Pkgs", value: inventoryOnly ? "See DSW summary" : String(dsw.actual_pickup_packages), color: "#0284c7", bg: "#f0f9ff" },
    { label: "ILS", value: ils, color: "#0f766e", bg: "#f0fdfa" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 6 }}>
      {facts.map((fact) => (
        <div key={fact.label} style={{ border: `1px solid ${fact.color}33`, borderTop: `4px solid ${fact.color}`, borderRadius: 11, background: fact.bg, padding: "7px 8px", display: "grid", gap: 2 }}>
          <span style={{ color: fact.color, fontSize: 8, fontWeight: 950, letterSpacing: "0.05em", textTransform: "uppercase" }}>{fact.label}</span>
          <strong style={{ color: "#0f172a", fontSize: 12 }}>{fact.value}</strong>
        </div>
      ))}
    </div>
  );
}

function value(row: Record<string, unknown>, key: string) {
  const result = row[key];
  return result === null || result === undefined || result === "" ? "—" : String(result);
}

function address(row: Record<string, unknown>) {
  return ["address_line_1", "address_line_2", "city", "state", "postal_code"]
    .map((key) => value(row, key))
    .filter((part) => part !== "—")
    .join(", ");
}

type CombinedManifestItem = {
  key: string;
  mapRefs: string[];
  kind: "delivery" | "pickup" | "combined";
  sequence: number;
  title: string;
  subtitle: string;
  address: string;
  window: string;
  packageCount: number;
  expectedCount: number | null;
  pickupPackageCount: number;
  pickupExpectedCount: number | null;
  complete: boolean;
  open: boolean;
  coded: boolean;
  attention: boolean;
  packageLinked: boolean;
  packageMismatch: boolean;
  express: boolean;
  signature: boolean;
  hazmat: boolean;
  collection: boolean;
  unmanifested: boolean;
  instructions: string;
  contact: string;
  packages: Array<Record<string, unknown>>;
};

function rawValue(row: Record<string, unknown>, key: string) {
  return String(row[key] ?? "").trim();
}

function normalizedIdentityPart(input: string) {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

function identity(row: Record<string, unknown>) {
  const stopNumber = rawValue(row, "st_number");
  const sid = rawValue(row, "sid");
  if (sid) {
    return `SID|${normalizedIdentityPart(sid)}`;
  }
  const detailIdentity = [
    normalizedIdentityPart(address(row)),
    normalizedIdentityPart(rawValue(row, "recipient")),
    normalizedIdentityPart(rawValue(row, "contact_name")),
    normalizedIdentityPart(rawValue(row, "delivery_time_begin")),
    normalizedIdentityPart(rawValue(row, "delivery_time_end")),
  ].join("|");
  return detailIdentity.replaceAll("|", "")
    ? `DETAIL|${detailIdentity}`
    : `STOP|${normalizedIdentityPart(stopNumber)}`;
}

function truthy(row: Record<string, unknown>, key: string) {
  return row[key] === true || String(row[key] ?? "").toUpperCase() === "Y";
}

function numberValue(row: Record<string, unknown>, key: string) {
  const parsed = Number(row[key] ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sequenceValue(valueToParse: unknown, fallback: number) {
  const parsed = Number.parseInt(String(valueToParse ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCombinedManifest(detail: RouteDetailPayload) {
  const identityVerified = detail.identity_access?.verified === true;
  const packagesByStop = new Map<string, Array<Record<string, unknown>>>();
  detail.packages.forEach((packageRow) => {
    const key = identity(packageRow);
    packagesByStop.set(key, [...(packagesByStop.get(key) ?? []), packageRow]);
  });

  const canonicalStops = Array.from(
    detail.delivery_stops.reduce<Map<string, Record<string, unknown>>>((stops, stop) => {
      const key = identity(stop);
      const current = stops.get(key);
      if (!current || String(stop.created_at ?? "") >= String(current.created_at ?? "")) {
        stops.set(key, stop);
      }
      return stops;
    }, new Map()).values()
  );

  const deliveries = canonicalStops.map<CombinedManifestItem>((stop, index) => {
    const packages = packagesByStop.get(identity(stop)) ?? [];
    const unmanifested = !rawValue(stop, "sid");
    const packageLinked = packages.length > 0;
    const evidenceStates = packages.map((packageRow) =>
      rawValue(packageRow, "delivery_evidence_state")
    );
    const hasOpen = evidenceStates.includes("OPEN");
    const hasCodedAttempt = evidenceStates.includes("CODED_ATTEMPT");
    const hasDataHealthIssue = packages.some((packageRow) => {
      const dataHealth = packageRow.delivery_data_health;
      return Array.isArray(dataHealth) && dataHealth.length > 0;
    });
    const hasCompleteEvidence = evidenceStates.every(
      (state) => state === "COMPLETED"
    );
    const attention =
      unmanifested ||
      !packageLinked ||
      hasDataHealthIssue ||
      !evidenceStates.every((state) =>
        ["OPEN", "CODED_ATTEMPT", "COMPLETED"].includes(
          state
        )
      );
    return {
      key: `delivery-${identity(stop)}-${index}`,
      mapRefs: rawValue(stop, "_route_map_ref")
        ? [rawValue(stop, "_route_map_ref")]
        : [],
      kind: "delivery",
      sequence: sequenceValue(stop.st_number, index + 1),
      title: manifestDeliveryStopTitle(stop, identityVerified),
      subtitle: `SID ${value(stop, "sid")}`,
      address: address(stop),
      window: `${value(stop, "delivery_time_begin")}–${value(stop, "delivery_time_end")}`,
      packageCount: packages.length || numberValue(stop, "package_count"),
      expectedCount: null,
      pickupPackageCount: 0,
      pickupExpectedCount: null,
      complete: !attention && hasCompleteEvidence,
      open: !attention && hasOpen,
      coded: !attention && hasCodedAttempt,
      attention,
      packageLinked,
      packageMismatch: !unmanifested && !packageLinked,
      express: packages.some((row) => truthy(row, "is_express")),
      signature: packages.some((row) => truthy(row, "is_signature")),
      hazmat: packages.some((row) => truthy(row, "is_hazmat")),
      collection: packages.some((row) => truthy(row, "is_collection")),
      unmanifested,
      instructions: value(stop, "stop_instructions"),
      contact: value(stop, "contact_name"),
      packages,
    };
  });

  const pickups = detail.pickups.map<CombinedManifestItem>((pickup, index) => {
    const actual = numberValue(pickup, "packages_picked_up");
    const expected = numberValue(pickup, "package_count_expected");
    return {
      key: `pickup-${value(pickup, "puid")}-${index}`,
      mapRefs: rawValue(pickup, "_route_map_ref")
        ? [rawValue(pickup, "_route_map_ref")]
        : [],
      kind: "pickup",
      sequence: sequenceValue(pickup.pickup_list, 10000 + index),
      title: manifestPickupStopTitle(pickup, identityVerified),
      subtitle: `PUID ${value(pickup, "puid")} · ${value(pickup, "pickup_type")}`,
      address: address(pickup),
      window: `${value(pickup, "ready_at")}–${value(pickup, "close_at")}`,
      packageCount: actual,
      expectedCount: expected,
      pickupPackageCount: actual,
      pickupExpectedCount: expected,
      complete: expected === 0 ? Boolean(pickup.pu_closed_at) : actual >= expected,
      open: expected === 0 ? !pickup.pu_closed_at : actual < expected,
      coded: false,
      attention: false,
      packageLinked: true,
      packageMismatch: false,
      express: false,
      signature: false,
      hazmat: false,
      collection: false,
      unmanifested: false,
      instructions: value(pickup, "reason_code"),
      contact: value(pickup, "shipper_number"),
      packages: [],
    };
  });

  const unmatchedPickups = [...pickups];
  const combined: CombinedManifestItem[] = [];
  const remainingDeliveries: CombinedManifestItem[] = [];

  deliveries.forEach((delivery) => {
    const addressToken = (input: string) => normalizedIdentityPart(input).replace(/[^A-Z0-9]/g, "");
    const zipToken = (input: string) => input.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) ?? "";
    const streetNumber = (input: string) => input.match(/^\s*(\d+[A-Z]?)/i)?.[1]?.toUpperCase() ?? "";
    const deliveryAddress = addressToken(delivery.address);
    const deliveryZip = zipToken(delivery.address);
    const deliveryStreetNumber = streetNumber(delivery.address);
    let pickupIndex = deliveryAddress
      ? unmatchedPickups.findIndex((pickup) => {
          const pickupAddress = addressToken(pickup.address);
          if (pickupAddress === deliveryAddress) return true;
          const pickupZip = zipToken(pickup.address);
          const pickupStreetNumber = streetNumber(pickup.address);
          return Boolean(
            deliveryZip &&
            pickupZip === deliveryZip &&
            deliveryStreetNumber &&
            pickupStreetNumber === deliveryStreetNumber
          );
        })
      : -1;

    if (pickupIndex < 0 && delivery.collection && unmatchedPickups.length > 0) {
      pickupIndex = 0;
    }

    if (pickupIndex < 0) {
      remainingDeliveries.push(delivery);
      return;
    }

    const [pickup] = unmatchedPickups.splice(pickupIndex, 1);
    combined.push({
      ...delivery,
      key: `combined-${delivery.key}-${pickup.key}`,
      kind: "combined",
      mapRefs: [...delivery.mapRefs, ...pickup.mapRefs],
      title: `${delivery.title} · Delivery + Pickup`,
      subtitle: `${delivery.subtitle} · ${pickup.subtitle}`,
      window: `${delivery.window} · Pickup ${pickup.window}`,
      pickupPackageCount: pickup.packageCount,
      pickupExpectedCount: pickup.expectedCount,
      complete: !delivery.attention && delivery.complete && pickup.complete,
      open:
        !delivery.attention &&
        !delivery.unmanifested &&
        !delivery.packageMismatch &&
        (delivery.open || pickup.open),
      coded:
        !delivery.attention &&
        !delivery.unmanifested &&
        !delivery.packageMismatch &&
        delivery.coded,
      attention: delivery.attention,
      collection: delivery.collection,
      instructions: [delivery.instructions, pickup.instructions]
        .filter((part) => part !== "—")
        .join(" · ") || "—",
      contact: [delivery.contact, pickup.contact]
        .filter((part) => part !== "—")
        .join(" · ") || "—",
    });
  });

  return [...remainingDeliveries, ...combined, ...unmatchedPickups].sort(
    (left, right) => left.sequence - right.sequence
  );
}

function buildMapStopDetails(items: CombinedManifestItem[]) {
  const details: Record<string, RouteMapStopDetail> = {};

  items.forEach((item) => {
    const evidenceStates = item.packages
      .map((packageRow) => rawValue(packageRow, "delivery_evidence_state"))
      .filter(Boolean);
    const evidenceCounts = evidenceStates.reduce<Record<string, number>>(
      (counts, state) => {
        counts[state] = (counts[state] ?? 0) + 1;
        return counts;
      },
      {}
    );
    const evidenceSummary = Object.entries(evidenceCounts)
      .map(([state, count]) => `${count} ${state.toLowerCase().replaceAll("_", " ")}`)
      .join(" · ");
    const observedTimes = item.packages
      .flatMap((packageRow) => [
        rawValue(packageRow, "star_scan_at_local"),
        rawValue(packageRow, "vision_label_at_local"),
      ])
      .filter(Boolean)
      .sort();
    const latestObserved = observedTimes.at(-1);
    const evidence = evidenceSummary
      ? `${evidenceSummary}${latestObserved ? ` · latest ${terminalTime(latestObserved)}` : ""}`
      : item.kind === "pickup"
        ? `${item.pickupPackageCount} of ${item.pickupExpectedCount ?? "—"} pickup packages recorded`
        : "No package-level delivery or attempt evidence is linked to this stop.";
    const outcome = item.unmanifested
      ? "Manifest link unavailable"
      : item.packageMismatch
        ? "Manifest stop found · package evidence link failed"
        : item.complete
          ? "Delivered / completed"
          : item.coded
            ? "Attempt recorded · coded"
            : item.open
              ? "Open · no delivery or attempt evidence"
              : item.attention
                ? "Evidence needs inspection"
                : "Current outcome unavailable";
    const statusCodes = Array.from(new Set(item.packages.flatMap((packageRow) => {
      const codes = [
        ["VSA", rawValue(packageRow, "vsa_status_code")],
        ["STAR", rawValue(packageRow, "star_status_code")],
        ["Vision label", rawValue(packageRow, "vision_label")],
      ] as const;
      return codes
        .filter(([, code]) => code && code !== "0")
        .map(([label, code]) => `${label} ${code}`);
    })));
    const trackingIds = Array.from(new Set(
      item.packages.map((packageRow) => rawValue(packageRow, "tracking_id")).filter(Boolean)
    ));
    const packageReferences = trackingIds.length > 5
      ? [...trackingIds.slice(0, 5), `+${trackingIds.length - 5} more`]
      : trackingIds;
    const dataHealth = Array.from(new Set(item.packages.flatMap((packageRow) => {
      const valueToRead = packageRow.delivery_data_health;
      return Array.isArray(valueToRead)
        ? valueToRead.map((entry) => String(entry).replaceAll("_", " ").toLowerCase())
        : [];
    })));
    const serviceFlags = [
      item.express ? "Express" : "",
      item.signature ? "Signature required" : "",
      item.hazmat ? "Hazmat" : "",
      item.collection ? "Collection" : "",
      ...dataHealth,
    ].filter(Boolean);
    const stopDetail: RouteMapStopDetail = {
      title: item.title,
      address: item.address,
      window: item.window,
      outcome,
      evidence,
      statusCodes,
      packageReferences,
      serviceFlags,
    };

    item.mapRefs.forEach((mapRef) => {
      details[mapRef] = stopDetail;
    });
  });

  return details;
}

type CompletionFilter = "all" | "open" | "coded" | "completed" | "attention";

function matchesCompletionFilter(item: CombinedManifestItem, filter: CompletionFilter) {
  return filter === "all" ||
    (filter === "open" && item.open) ||
    (filter === "coded" && item.coded) ||
    (filter === "completed" && item.complete) ||
    (filter === "attention" && item.attention);
}

function RouteManifestDetail(props: {
  detail: RouteDetailPayload | null;
  dsw: Props["dsw"];
  loading: boolean;
  error: string | null;
  items: CombinedManifestItem[];
  selectedRef: string | null;
  onSelect: (item: CombinedManifestItem) => void;
  visible: boolean;
}) {
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const selectedRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.visible || !props.selectedRef) return;
    const selectedItem = props.items.find((item) =>
      item.mapRefs.includes(props.selectedRef ?? "") || item.key === props.selectedRef
    );
    if (!selectedItem) return;
    const frame = window.requestAnimationFrame(() => {
      selectedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      selectedRowRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [completionFilter, props.items, props.selectedRef, props.visible]);
  if (props.loading) return <div style={{ padding: 12, color: "#64748b" }}>Loading manifest rows…</div>;
  if (props.error) return <div style={{ padding: 12, color: "#991b1b" }}>{props.error}</div>;
  if (!props.detail) return null;

  const identityVerified = props.detail.identity_access?.verified === true;
  const visibleItems = props.items.filter((item) =>
    matchesCompletionFilter(item, completionFilter) ||
    item.mapRefs.includes(props.selectedRef ?? "") ||
    item.key === props.selectedRef
  );
  const allCount = props.items.length;
  const openCount = props.items.filter((item) => item.open).length;
  const codedCount = props.items.filter((item) => item.coded).length;
  const closedCount = props.items.filter((item) => item.complete).length;
  const attentionCount = props.items.filter((item) => item.attention).length;
  const packageCount = props.detail.packages.length;

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div>
        <strong style={{ fontSize: 18 }}>Manifest</strong>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>
          {allCount} stops · {packageCount} packages · select a row to inspect and locate
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${identityVerified ? "#86efac" : "#fcd34d"}`,
          borderRadius: 12,
          background: identityVerified ? "#f0fdf4" : "#fffbeb",
          color: identityVerified ? "#166534" : "#92400e",
          padding: "9px 11px",
          fontSize: 11,
          fontWeight: 900,
        }}
      >
        {props.detail.retention_mode === "DEIDENTIFIED"
          ? "Retention view · recipient, street address, and original tracking identity have expired. Operational stop, ZIP, status, flags, and non-reversible package references remain."
          : identityVerified
          ? "Verified FedEx credentials · original manifest identity detail is available."
          : "Recipient and shipper names are hidden because verified FedEx credentials are not currently available."}
      </div>

      <div style={{ border: "1px solid #dbe4ef", borderRadius: 12, background: "#fff", padding: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
          {([[
            "all", "All", allCount,
          ], ["open", "Open", openCount], ["coded", "Attempted", codedCount], ["completed", "Completed", closedCount], ["attention", "Inspect", attentionCount]] as const).map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setCompletionFilter(key)} style={{ border: `1px solid ${completionFilter === key ? "#0f172a" : "transparent"}`, borderRadius: 8, background: completionFilter === key ? "#0f172a" : "#f8fafc", color: completionFilter === key ? "#fff" : "#475569", minHeight: 32, fontSize: 9, fontWeight: 950 }}>
              {label}<br />{count}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.manifestRows}>
        {visibleItems.length === 0 ? (
          <div style={{ border: "1px solid #e5ecf6", borderRadius: 14, background: "#fff", padding: 14, color: "#64748b", fontSize: 13 }}>No combined-manifest stops match this view.</div>
        ) : visibleItems.map((item) => {
          const itemColor = item.unmanifested ? "#b91c1c" : item.hazmat ? "#dc2626" : item.kind === "combined" ? "#7c3aed" : item.kind === "pickup" ? "#2563eb" : item.express ? "#f97316" : item.collection ? "#0284c7" : "#16a34a";
          const selected = item.mapRefs.includes(props.selectedRef ?? "") || item.key === props.selectedRef;
          const status = item.unmanifested
            ? "Unmanifested"
            : item.packageMismatch
              ? "Link failure"
              : item.complete
                ? "Completed"
                : item.coded
                  ? "Attempted"
                  : "Open";
          return (
            <div key={item.key} ref={selected ? selectedRowRef : undefined}>
              <button
                type="button"
                className={styles.manifestRow}
                data-selected={String(selected)}
                aria-expanded={selected}
                onClick={() => props.onSelect(item)}
                style={{ "--manifest-row-color": itemColor } as CSSProperties}
              >
                <span className={styles.manifestSequence}>{item.sequence}</span>
                <span className={styles.manifestPrimary}>{item.title}</span>
                <span className={styles.manifestMeta}>
                  {item.kind === "combined" ? `D ${item.packageCount} · P ${item.pickupPackageCount}` : `${item.packageCount} pkg`}
                </span>
                <span className={styles.manifestStatus}>{status}</span>
              </button>
              {selected ? (
                <div className={styles.manifestInline}>
                  <div className={styles.manifestInlineGrid}>
                    <div><strong>Type</strong><br />{item.express ? "Express delivery" : item.kind}</div>
                    <div><strong>Window</strong><br />{item.window}</div>
                    <div style={{ gridColumn: "1 / -1" }}><strong>Address</strong><br />{item.address || "Address unavailable"}</div>
                    <div style={{ gridColumn: "1 / -1" }}><strong>Reference</strong><br />{item.subtitle}</div>
                    {identityVerified ? (
                      <div style={{ gridColumn: "1 / -1" }}><strong>Contact</strong><br />{item.contact}</div>
                    ) : null}
                    <div style={{ gridColumn: "1 / -1" }}><strong>Instructions</strong><br />{item.instructions}</div>
                  </div>
                  {item.packages.length ? (
                    <div style={{ display: "grid", gap: 4, marginTop: 9 }}>
                      {item.packages.map((packageRow, index) => (
                        <div key={`${value(packageRow, "tracking_id")}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, borderTop: "1px solid #dbeafe", paddingTop: 5 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{value(packageRow, "tracking_id")}</span>
                          <strong>{value(packageRow, "delivery_evidence_state")}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
