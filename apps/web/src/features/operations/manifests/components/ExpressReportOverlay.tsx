"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExpressProgressSignal } from "@/features/operations/express/ExpressProgressSignal";
import {
  expressTimeFrameSortKey,
  routeWorkAreaLabel,
} from "./expressReport.presentation";

const EXPRESS_MAP_TAB_ENABLED = process.env.NEXT_PUBLIC_EXPRESS_MAP_TAB_ENABLED === "true";

type ExpressRouteSummary = {
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  express_package_count: number;
  express_stop_count: number;
  complete_express_package_count: number;
  attempted_express_package_count: number;
  open_express_package_count: number;
  tracking_identity_missing_count: number;
  stop_link_missing_count: number;
  stop_link_ambiguous_count: number;
  reference_match_available: boolean;
  residential_express_package_count: number;
  signature_express_package_count: number;
  hazmat_express_package_count: number;
  collection_express_package_count: number;
  latest_captured_at: string | null;
  latest_processed_at: string | null;
};

type ExpressPackageRow = {
  route_key: string;
  route_label: string | null;
  st_number: string | null;
  sid: string | null;
  tracking_id: string | null;
  prem_svc_raw: string | null;
  completed: string | null;
  delivery_evidence_state:
    | "OPEN"
    | "CODED_ATTEMPT"
    | "COMPLETED";
  delivery_data_health: Array<
    | "TRACKING_IDENTITY_MISSING"
    | "REFERENCE_MATCH_UNAVAILABLE"
    | "STOP_LINK_MISSING"
    | "STOP_LINK_AMBIGUOUS"
  >;
  status_code_source: "VSA" | "STAR" | "VSA_AND_STAR" | null;
  vsa_status_code: string | null;
  star_status_code: string | null;
  status_code_at_local: string | null;
  delivery_time_begin: string | null;
  delivery_time_end: string | null;
  recipient: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  artifact_status: string | null;
  captured_at: string | null;
  processed_at: string | null;
};

type ExpressMapStop = {
  stop_key: string;
  route_key: string;
  route_label: string | null;
  sid: string | null;
  st_number: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string | null;
  package_count: number;
  open_count: number;
  coded_attempt_count: number;
  complete_count: number;
  delivery_time_begin: string | null;
  delivery_time_end: string | null;
};

type ExpressReportPayload = {
  company_slug: string;
  service_date: string;
  route_summaries: ExpressRouteSummary[];
  totals: {
    route_count: number;
    express_package_count: number;
    express_stop_count: number;
    complete_express_package_count: number;
    attempted_express_package_count: number;
    open_express_package_count: number;
    tracking_identity_missing_count: number;
    stop_link_missing_count: number;
    stop_link_ambiguous_count: number;
    reference_match_available: boolean;
    residential_express_package_count: number;
    signature_express_package_count: number;
    hazmat_express_package_count: number;
    collection_express_package_count: number;
  } | null;
  freshness?: {
    latest_captured_at: string | null;
    latest_processed_at: string | null;
    artifact_statuses: Record<string, number>;
  };
  map_stops?: ExpressMapStop[];
  packages: ExpressPackageRow[];
  error?: string;
};

type TimeFrameGroup = {
  key: string;
  label: string;
  sortKey: string;
  packages: ExpressPackageRow[];
  routes: Array<{
    route_key: string;
    route_label: string | null;
    package_count: number;
    open_count: number;
    coded_attempt_count: number;
    complete_count: number;
    stop_count: number;
    packages: ExpressPackageRow[];
  }>;
  package_count: number;
  open_count: number;
  coded_attempt_count: number;
  complete_count: number;
  stop_count: number;
};

type Props = {
  open: boolean;
  slug: string;
  serviceDate: string;
  surfaceLabel: "Dispatch" | "Service" | "Operations";
  onClose: () => void;
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function fmtAddress(row: ExpressPackageRow | ExpressMapStop) {
  return [
    row.address_line_1,
    row.address_line_2,
    [row.city, row.state, row.postal_code].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function isComplete(row: ExpressPackageRow) {
  return row.delivery_evidence_state === "COMPLETED";
}

function packageEvidenceLabel(row: ExpressPackageRow) {
  if (isComplete(row)) return "Complete";
  if (row.delivery_evidence_state === "OPEN") return "Open";

  const codes = [
    row.vsa_status_code ? `VSA ${row.vsa_status_code}` : "",
    row.star_status_code ? `STAR ${row.star_status_code}` : "",
  ].filter(Boolean);
  return `Attempted${codes.length ? ` · ${codes.join(" · ")}` : " · Coded"}`;
}

function serviceWindow(row: Pick<ExpressPackageRow | ExpressMapStop, "delivery_time_begin" | "delivery_time_end">) {
  if (!row.delivery_time_begin && !row.delivery_time_end) return "No time window";
  return `${row.delivery_time_begin || "—"}–${row.delivery_time_end || "—"}`;
}

function stopKey(row: ExpressPackageRow) {
  return [
    row.route_key,
    row.sid,
    row.st_number,
    row.address_line_1,
    row.address_line_2,
    row.city,
    row.state,
    row.postal_code,
  ]
    .map((part) => String(part ?? "").trim().toUpperCase())
    .filter(Boolean)
    .join("|");
}

function buildTimeFrameGroups(rows: ExpressPackageRow[]): TimeFrameGroup[] {
  const grouped = new Map<string, ExpressPackageRow[]>();

  for (const row of rows) {
    const key = `${row.delivery_time_begin || ""}|${row.delivery_time_end || ""}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .map(([key, packages]) => {
      const first = packages[0];
      const routeMap = new Map<string, ExpressPackageRow[]>();

      for (const pkg of packages) {
        const routeKey = pkg.route_key || "unknown";
        routeMap.set(routeKey, [...(routeMap.get(routeKey) ?? []), pkg]);
      }

      const routes = Array.from(routeMap.entries()).map(([routeKey, routePackages]) => ({
        route_key: routeKey,
        route_label: routePackages[0]?.route_label ?? null,
        package_count: routePackages.length,
        open_count: routePackages.filter((pkg) => pkg.delivery_evidence_state === "OPEN").length,
        coded_attempt_count: routePackages.filter(
          (pkg) => pkg.delivery_evidence_state === "CODED_ATTEMPT"
        ).length,
        complete_count: routePackages.filter(isComplete).length,
        stop_count: new Set(routePackages.map(stopKey)).size,
        packages: routePackages,
      }));

      const openCount = packages.filter((pkg) => pkg.delivery_evidence_state === "OPEN").length;
      const codedAttemptCount = packages.filter(
        (pkg) => pkg.delivery_evidence_state === "CODED_ATTEMPT"
      ).length;
      const completeCount = packages.filter(isComplete).length;

      return {
        key,
        label: serviceWindow(first),
        sortKey: expressTimeFrameSortKey(
          first.delivery_time_begin,
          first.delivery_time_end
        ),
        packages,
        routes: routes.sort((a, b) => b.open_count - a.open_count || b.package_count - a.package_count),
        package_count: packages.length,
        open_count: openCount,
        coded_attempt_count: codedAttemptCount,
        complete_count: completeCount,
        stop_count: new Set(packages.map(stopKey)).size,
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function mapCoordinate(value: number, min: number, max: number) {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 82 + 9;
}

export default function ExpressReportOverlay({
  open,
  slug,
  serviceDate,
  surfaceLabel,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ExpressReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"exposure" | "map">("exposure");
  const [selectedStop, setSelectedStop] = useState<ExpressMapStop | null>(null);
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  const packages = useMemo(() => payload?.packages ?? [], [payload?.packages]);
  const mapStops = useMemo(
    () => (EXPRESS_MAP_TAB_ENABLED ? payload?.map_stops ?? [] : []),
    [payload?.map_stops]
  );
  const visiblePackages = useMemo(
    () => (showOpenOnly ? packages.filter((pkg) => pkg.delivery_evidence_state === "OPEN") : packages),
    [packages, showOpenOnly]
  );
  const timeFrameGroups = useMemo(
    () => buildTimeFrameGroups(visiblePackages),
    [visiblePackages]
  );
  const geocodedStops = useMemo(
    () => mapStops.filter((stop) => typeof stop.latitude === "number" && typeof stop.longitude === "number"),
    [mapStops]
  );
  const unmappedStops = mapStops.length - geocodedStops.length;

  const mapBounds = useMemo(() => {
    const lats = geocodedStops.map((stop) => stop.latitude as number);
    const lngs = geocodedStops.map((stop) => stop.longitude as number);

    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [geocodedStops]);

  useEffect(() => {
    if (!open || !slug || !serviceDate) return;

    let active = true;

    async function loadExpressReport() {
      setLoading(true);
      setError(null);
      setSelectedStop(null);

      try {
        const res = await fetch(
          `/api/company/${slug}/operations/express-report?serviceDate=${encodeURIComponent(serviceDate)}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = (await res.json()) as ExpressReportPayload;

        if (!active) return;

        if (!res.ok) {
          setPayload(null);
          setError(data?.error ?? "Failed to load Express report.");
          return;
        }

        setPayload(data);
      } catch {
        if (active) {
          setPayload(null);
          setError("Failed to load Express report.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadExpressReport();

    return () => {
      active = false;
    };
  }, [open, serviceDate, slug]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const totals = payload?.totals;
  const openCount = totals?.open_express_package_count ?? 0;
  const codedAttemptCount =
    totals?.attempted_express_package_count ?? 0;
  const completeCount = totals?.complete_express_package_count ?? 0;
  const totalCount = totals?.express_package_count ?? 0;
  const openPct = totalCount > 0 ? Math.round((openCount / totalCount) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${surfaceLabel} Express Report`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(2, 6, 23, 0.62)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <section
        style={{
          width: "min(1080px, 100%)",
          maxHeight: "min(92vh, 980px)",
          background: "linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%)",
          border: "1px solid rgba(226, 232, 240, 0.86)",
          borderRadius: 24,
          boxShadow: "0 30px 90px rgba(2, 6, 23, 0.38)",
          padding: 18,
          overflow: "auto",
          display: "grid",
          alignContent: "start",
          gap: 14,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
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
                letterSpacing: "0.1em",
              }}
            >
              {surfaceLabel} · Express Report
            </p>
            <h2 style={{ margin: 0, fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.04em" }}>
              Protected service performance
            </h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, fontWeight: 800 }}>
              Service date {serviceDate} · Time-frame adherence first
            </p>
          </div>

          <button
            type="button"
            className="button"
            onClick={onClose}
            style={{ minHeight: 34, padding: "0 13px", fontSize: 12 }}
          >
            Close
          </button>
        </header>

        {loading ? <StatusCard tone="neutral" label="Loading Express report..." /> : null}
        {error ? <StatusCard tone="danger" label={error} /> : null}

        {totals ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            <ExpressProgressSignal
              progress={{ total: totalCount, complete: completeCount, attempted: codedAttemptCount, open: openCount }}
              dataHealth={{
                trackingIdentityMissing: totals.tracking_identity_missing_count,
                stopLinkMissing: totals.stop_link_missing_count,
                stopLinkAmbiguous: totals.stop_link_ambiguous_count,
                referenceMatchAvailable: totals.reference_match_available,
              }}
              style={{ gridColumn: "span 3" }}
            />
            <MetricCard label="Time windows" value={timeFrameGroups.length} tone="neutral" sublabel="Grouped first" />
            {EXPRESS_MAP_TAB_ENABLED ? (
              <MetricCard
                label="Map stops"
                value={mapStops.length || totals.express_stop_count}
                tone="neutral"
                sublabel={`${unmappedStops} pending coordinates`}
              />
            ) : null}
          </section>
        ) : null}

        {payload?.freshness ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 800 }}>
            Latest processed {fmtDateTime(payload.freshness.latest_processed_at)}
          </p>
        ) : null}

        {!loading && payload && packages.length === 0 ? (
          <StatusCard tone="neutral" label="No Express packages found for this service date." />
        ) : null}

        {packages.length > 0 || (EXPRESS_MAP_TAB_ENABLED && mapStops.length > 0) ? (
          <section
            style={{
              border: "1px solid #dbeafe",
              borderRadius: 18,
              background: "rgba(255, 255, 255, 0.78)",
              padding: 6,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <TabButton
              label="Exposure"
              active={activeTab === "exposure"}
              onClick={() => setActiveTab("exposure")}
            />
            {EXPRESS_MAP_TAB_ENABLED ? (
              <TabButton
                label="Map"
                active={activeTab === "map"}
                onClick={() => setActiveTab("map")}
                badge={mapStops.length}
              />
            ) : null}
          </section>
        ) : null}

        {activeTab === "exposure" && packages.length > 0 ? (
          <section style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>Time-frame exposure</h3>
                <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>
                  Route appears inside each promised window
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowOpenOnly((value) => !value)}
                style={{
                  border: showOpenOnly ? "1px solid #ea580c" : "1px solid #cbd5e1",
                  background: showOpenOnly ? "#fff7ed" : "#fff",
                  color: showOpenOnly ? "#9a3412" : "#475569",
                  borderRadius: 999,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                {showOpenOnly ? `Showing Open only (${openPct}%)` : `Show Open only (${openPct}%)`}
              </button>
            </div>

            {timeFrameGroups.length > 0 ? (
              timeFrameGroups.map((group) => <TimeFrameCard key={group.key} group={group} />)
            ) : (
              <StatusCard tone="neutral" label="No open Express packages match this filter." />
            )}
          </section>
        ) : null}

        {EXPRESS_MAP_TAB_ENABLED && activeTab === "map" ? (
          <section
            style={{
              border: "1px solid #dbeafe",
              borderRadius: 20,
              background: "rgba(255, 255, 255, 0.86)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                borderBottom: "1px solid #dbeafe",
              }}
            >
              <span style={{ display: "grid", gap: 2 }}>
                <strong>Express volume map</strong>
                <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                  {mapStops.length} static stops · {geocodedStops.length} pinned · {unmappedStops} pending coordinates
                </span>
              </span>

              <span
                style={{
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 950,
                }}
              >
                Static stop view
              </span>
            </div>

            <div style={{ padding: 14, display: "grid", gap: 10 }}>
              <div
                style={{
                  position: "relative",
                  minHeight: 360,
                  borderRadius: 18,
                  border: "1px solid #cbd5e1",
                  background:
                    "radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.16), transparent 26%), linear-gradient(135deg, #e0f2fe 0%, #f8fafc 55%, #eef2ff 100%)",
                  overflow: "hidden",
                }}
              >
                {geocodedStops.length === 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      padding: 18,
                      textAlign: "center",
                      color: "#475569",
                      fontWeight: 900,
                    }}
                  >
                    Coordinates are pending. Static express stop pins will render here when lat/long is populated.
                  </div>
                ) : null}

                {geocodedStops.map((stop) => {
                  const x = mapCoordinate(stop.longitude as number, mapBounds.minLng, mapBounds.maxLng);
                  const y = 100 - mapCoordinate(stop.latitude as number, mapBounds.minLat, mapBounds.maxLat);
                  const isHot = stop.open_count > 0;

                  return (
                    <button
                      key={stop.stop_key}
                      type="button"
                      onClick={() => setSelectedStop(stop)}
                      title={`${stop.sid ?? "No SID"} · ${fmtAddress(stop)}`}
                      style={{
                        position: "absolute",
                        left: `${x}%`,
                        top: `${y}%`,
                        transform: "translate(-50%, -50%)",
                        width: isHot ? 16 : 12,
                        height: isHot ? 16 : 12,
                        borderRadius: 999,
                        border: "2px solid #fff",
                        background: isHot ? "#ea580c" : "#16a34a",
                        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.28)",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </div>

              {selectedStop ? (
                <div
                  style={{
                    border: "1px solid #bfdbfe",
                    background: "#eff6ff",
                    borderRadius: 14,
                    padding: 12,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <strong>SID {selectedStop.sid || "—"}</strong>
                  <span style={{ color: "#334155", fontSize: 12, fontWeight: 850 }}>
                    {fmtAddress(selectedStop) || "No address"}
                  </span>
                  <span style={{ color: "#475569", fontSize: 12, fontWeight: 850 }}>
                    {selectedStop.package_count} packages · {selectedStop.open_count} open ·{" "}
                    {selectedStop.coded_attempt_count} attempted ·{" "}
                    {selectedStop.complete_count} complete · {routeWorkAreaLabel(selectedStop.route_label, selectedStop.route_key)}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

      </section>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid #2563eb" : "1px solid transparent",
        background: active ? "#eff6ff" : "transparent",
        color: active ? "#1d4ed8" : "#475569",
        borderRadius: 14,
        padding: "9px 13px",
        fontSize: 13,
        fontWeight: 950,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
      }}
    >
      {label}
      {typeof badge === "number" ? (
        <span
          style={{
            borderRadius: 999,
            background: active ? "#dbeafe" : "#e2e8f0",
            color: active ? "#1d4ed8" : "#475569",
            padding: "2px 7px",
            fontSize: 11,
            fontWeight: 950,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function StatusCard({ label, tone }: { label: string; tone: "neutral" | "danger" }) {
  return (
    <div
      style={{
        border: tone === "danger" ? "1px solid #fecaca" : "1px solid #e2e8f0",
        background: tone === "danger" ? "#fef2f2" : "#fff",
        color: tone === "danger" ? "#991b1b" : "#64748b",
        borderRadius: 14,
        padding: 12,
        fontSize: 13,
        fontWeight: 900,
      }}
    >
      {label}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: number;
  sublabel: string;
  tone: "hot" | "attempt" | "cool" | "neutral";
}) {
  const color =
    tone === "hot"
      ? "#9a3412"
      : tone === "attempt"
        ? "#c2410c"
        : tone === "cool"
          ? "#166534"
          : "#0f172a";
  const background =
    tone === "hot" || tone === "attempt"
      ? "#fff7ed"
      : tone === "cool"
        ? "#ecfdf5"
        : "#fff";

  return (
    <div
      style={{
        border: "1px solid #e5ecf6",
        borderRadius: 18,
        background,
        padding: "13px 14px",
        display: "grid",
        gap: 2,
      }}
    >
      <span
        style={{
          color: "#64748b",
          fontSize: 10,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <strong style={{ color, fontSize: 28, lineHeight: 1 }}>{value}</strong>
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>{sublabel}</span>
    </div>
  );
}

function TimeFrameCard({ group }: { group: TimeFrameGroup }) {
  const openTone = group.open_count > 0;
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [expandedStop, setExpandedStop] = useState<string | null>(null);

  return (
    <section
      style={{
        border: openTone ? "1px solid #fed7aa" : "1px solid #bbf7d0",
        borderRadius: 18,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "12px 14px",
          background: openTone ? "#fffaf5" : "#f0fdf4",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div>
          <strong style={{ display: "block", fontSize: 16 }}>{group.label}</strong>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
            {group.stop_count} stops · {group.package_count} packages · {group.routes.length} routes
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill label={`${group.complete_count} Complete`} hot={false} />
          <Pill
            label={`${group.coded_attempt_count} Attempted`}
            hot={group.coded_attempt_count > 0}
          />
          <Pill label={`${group.open_count} Open`} hot={group.open_count > 0} />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 760,
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ background: "#f8fafc", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <TableHead align="left">Route</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead>Packages</TableHead>
              <TableHead>Complete</TableHead>
              <TableHead>Attempted</TableHead>
              <TableHead>Open</TableHead>
              <TableHead align="left">Status</TableHead>
            </tr>
          </thead>
          <tbody>
            {group.routes.map((route) => {
              const routeId = `${group.key}-${route.route_key}`;
              const isExpanded = expandedRoute === routeId;
              const stops = buildRouteStops(route.packages);

              return (
                <RouteTableRows
                  key={routeId}
                  routeId={routeId}
                  route={route}
                  stops={stops}
                  expanded={isExpanded}
                  expandedStop={expandedStop}
                  onToggleRoute={() => {
                    setExpandedRoute(isExpanded ? null : routeId);
                    setExpandedStop(null);
                  }}
                  onToggleStop={(key) => setExpandedStop((current) => (current === key ? null : key))}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type RouteStopGroup = {
  key: string;
  st_number: string | null;
  sid: string | null;
  address: string;
  window: string;
  packages: ExpressPackageRow[];
  open_count: number;
  coded_attempt_count: number;
  complete_count: number;
};

function buildRouteStops(packages: ExpressPackageRow[]): RouteStopGroup[] {
  const grouped = new Map<string, ExpressPackageRow[]>();

  for (const pkg of packages) {
    const key = stopKey(pkg) || pkg.tracking_id || `${pkg.route_key}|${pkg.st_number ?? ""}|${pkg.sid ?? ""}`;
    grouped.set(key, [...(grouped.get(key) ?? []), pkg]);
  }

  return Array.from(grouped.entries())
    .map(([key, stopPackages]) => {
      const first = stopPackages[0];
      const completeCount = stopPackages.filter(isComplete).length;
      return {
        key,
        st_number: first.st_number,
        sid: first.sid,
        address: fmtAddress(first) || "Address unavailable",
        window: serviceWindow(first),
        packages: stopPackages,
        open_count: stopPackages.filter((pkg) => pkg.delivery_evidence_state === "OPEN").length,
        coded_attempt_count: stopPackages.filter(
          (pkg) => pkg.delivery_evidence_state === "CODED_ATTEMPT"
        ).length,
        complete_count: completeCount,
      };
    })
    .sort((a, b) => Number(a.st_number || 9999) - Number(b.st_number || 9999));
}

function RouteTableRows({
  routeId,
  route,
  stops,
  expanded,
  expandedStop,
  onToggleRoute,
  onToggleStop,
}: {
  routeId: string;
  route: TimeFrameGroup["routes"][number];
  stops: RouteStopGroup[];
  expanded: boolean;
  expandedStop: string | null;
  onToggleRoute: () => void;
  onToggleStop: (key: string) => void;
}) {
  return (
    <>
      <tr
        onClick={onToggleRoute}
        style={{
          cursor: "pointer",
          background: route.open_count > 0 ? "#fffaf5" : "#fff",
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <TableCell align="left">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 950, color: "#0f172a" }}>
            <span aria-hidden="true" style={{ width: 14, color: "#64748b" }}>{expanded ? "▾" : "▸"}</span>
            {routeWorkAreaLabel(route.route_label, route.route_key)}
          </span>
        </TableCell>
        <TableCell>{route.stop_count}</TableCell>
        <TableCell>{route.package_count}</TableCell>
        <TableCell tone="cool">{route.complete_count}</TableCell>
        <TableCell tone={route.coded_attempt_count > 0 ? "hot" : undefined}>
          {route.coded_attempt_count}
        </TableCell>
        <TableCell tone={route.open_count > 0 ? "hot" : undefined}>{route.open_count}</TableCell>
        <TableCell align="left">
          <span style={{ fontWeight: 950, color: route.open_count > 0 ? "#9a3412" : "#166534" }}>
            {route.open_count > 0 ? "Exposure" : "Clear"}
          </span>
        </TableCell>
      </tr>

      {expanded ? (
        <tr>
          <td colSpan={7} style={{ padding: 0, background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ padding: "10px 12px 12px 28px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: "1px solid #dbe3ef" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <TableHead align="left">Stop</TableHead>
                    <TableHead align="left">Address</TableHead>
                    <TableHead align="left">Window</TableHead>
                    <TableHead>Packages</TableHead>
                    <TableHead align="left">Status</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {stops.map((stop) => {
                    const stopId = `${routeId}-${stop.key}`;
                    const stopExpanded = expandedStop === stopId;
                    return (
                      <StopTableRows
                        key={stopId}
                        stop={stop}
                        expanded={stopExpanded}
                        onToggle={() => onToggleStop(stopId)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function StopTableRows({ stop, expanded, onToggle }: { stop: RouteStopGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", borderTop: "1px solid #e2e8f0" }}>
        <TableCell align="left">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 900 }}>
            <span aria-hidden="true" style={{ width: 12, color: "#64748b" }}>{expanded ? "▾" : "▸"}</span>
            {stop.st_number && stop.st_number !== "0" ? `ST ${stop.st_number}` : "Unnumbered"}
            {stop.sid ? ` · SID ${stop.sid}` : ""}
          </span>
        </TableCell>
        <TableCell align="left">{stop.address}</TableCell>
        <TableCell align="left">{stop.window}</TableCell>
        <TableCell>{stop.packages.length}</TableCell>
        <TableCell align="left" tone={stop.open_count > 0 ? "hot" : "cool"}>
          {`${stop.complete_count} Complete · ${stop.coded_attempt_count} Attempted · ${stop.open_count} Open`}
        </TableCell>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={5} style={{ padding: 0, background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ padding: "8px 10px 10px 26px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                <thead>
                  <tr style={{ color: "#64748b", background: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <TableHead align="left">Tracking number</TableHead>
                    <TableHead align="left">Service</TableHead>
                    <TableHead align="left">Status</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {stop.packages.map((pkg, index) => (
                    <tr key={`${pkg.tracking_id ?? "package"}-${index}`} style={{ borderTop: "1px solid #edf2f7" }}>
                      <TableCell align="left">
                        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 850 }}>
                          {pkg.tracking_id || "—"}
                        </span>
                      </TableCell>
                      <TableCell align="left">{pkg.prem_svc_raw || "—"}</TableCell>
                      <TableCell align="left" tone={isComplete(pkg) ? "cool" : "hot"}>
                        {packageEvidenceLabel(pkg)}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TableHead({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return <th style={{ padding: "8px 10px", textAlign: align, fontSize: 10, fontWeight: 950 }}>{children}</th>;
}

function TableCell({
  children,
  align = "right",
  tone,
}: {
  children: ReactNode;
  align?: "left" | "right";
  tone?: "hot" | "cool";
}) {
  return (
    <td
      style={{
        padding: "9px 10px",
        textAlign: align,
        color: tone === "hot" ? "#9a3412" : tone === "cool" ? "#166534" : "#334155",
        fontWeight: tone ? 950 : 800,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

function Pill({ label, hot }: { label: string; hot: boolean }) {
  return (
    <span
      style={{
        border: hot ? "1px solid #fed7aa" : "1px solid #bbf7d0",
        background: hot ? "#fff7ed" : "#ecfdf5",
        color: hot ? "#9a3412" : "#166534",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 950,
      }}
    >
      {label}
    </span>
  );
}
