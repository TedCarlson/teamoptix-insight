"use client";

import { useEffect, useMemo, useState } from "react";

type ExpressRouteSummary = {
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  express_package_count: number;
  express_stop_count: number;
  completed_express_package_count: number;
  incomplete_express_package_count: number;
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
    completed_express_package_count: number;
    incomplete_express_package_count: number;
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
    complete_count: number;
    stop_count: number;
  }>;
  package_count: number;
  open_count: number;
  complete_count: number;
  stop_count: number;
};

type Props = {
  open: boolean;
  slug: string;
  serviceDate: string;
  surfaceLabel: "Dispatch" | "Service";
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

function isComplete(value: string | null) {
  return String(value ?? "").trim().toUpperCase() === "Y";
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
        open_count: routePackages.filter((pkg) => !isComplete(pkg.completed)).length,
        complete_count: routePackages.filter((pkg) => isComplete(pkg.completed)).length,
        stop_count: new Set(routePackages.map(stopKey)).size,
      }));

      const openCount = packages.filter((pkg) => !isComplete(pkg.completed)).length;
      const completeCount = packages.length - openCount;

      return {
        key,
        label: serviceWindow(first),
        sortKey: `${first.delivery_time_end || "99:99"}|${first.delivery_time_begin || "99:99"}`,
        packages,
        routes: routes.sort((a, b) => b.open_count - a.open_count || b.package_count - a.package_count),
        package_count: packages.length,
        open_count: openCount,
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

  const packages = useMemo(() => payload?.packages ?? [], [payload?.packages]);
  const mapStops = useMemo(() => payload?.map_stops ?? [], [payload?.map_stops]);
  const timeFrameGroups = useMemo(() => buildTimeFrameGroups(packages), [packages]);
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
  const openCount = totals?.incomplete_express_package_count ?? 0;
  const completeCount = totals?.completed_express_package_count ?? 0;
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
              Protected service exposure
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
            <MetricCard label="Open" value={openCount} tone="hot" sublabel={`${openPct}% of express volume`} />
            <MetricCard label="Complete" value={completeCount} tone="cool" sublabel="Closed packages" />
            <MetricCard label="Time windows" value={timeFrameGroups.length} tone="neutral" sublabel="Grouped first" />
            <MetricCard
              label="Map stops"
              value={mapStops.length || totals.express_stop_count}
              tone="neutral"
              sublabel={`${unmappedStops} pending coordinates`}
            />
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

        {packages.length > 0 || mapStops.length > 0 ? (
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
            <TabButton
              label="Map"
              active={activeTab === "map"}
              onClick={() => setActiveTab("map")}
              badge={mapStops.length}
            />
          </section>
        ) : null}

        {activeTab === "exposure" && packages.length > 0 ? (
          <section style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Time-frame exposure</h3>
              <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>
                Route appears inside each promised window
              </span>
            </div>

            {timeFrameGroups.map((group) => (
              <TimeFrameCard key={group.key} group={group} />
            ))}
          </section>
        ) : null}

        {activeTab === "map" ? (
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
                    {selectedStop.complete_count} complete · {selectedStop.route_label || selectedStop.route_key}
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
  tone: "hot" | "cool" | "neutral";
}) {
  const color = tone === "hot" ? "#9a3412" : tone === "cool" ? "#166534" : "#0f172a";
  const background = tone === "hot" ? "#fff7ed" : tone === "cool" ? "#ecfdf5" : "#fff";

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

  return (
    <section
      style={{
        border: openTone ? "1px solid #fed7aa" : "1px solid #bbf7d0",
        borderRadius: 18,
        background: "#fff",
        padding: 13,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <strong style={{ display: "block", fontSize: 16 }}>{group.label}</strong>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
            {group.stop_count} stops · {group.package_count} packages · {group.routes.length} routes
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill label={`${group.open_count} open`} hot={group.open_count > 0} />
          <Pill label={`${group.complete_count} complete`} hot={false} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
        {group.routes.map((route) => (
          <div
            key={`${group.key}-${route.route_key}`}
            style={{
              border: "1px solid #edf2f7",
              borderRadius: 14,
              padding: "9px 10px",
              display: "grid",
              gap: 5,
              background: route.open_count > 0 ? "#fffaf5" : "#f8fafc",
            }}
          >
            <strong style={{ fontSize: 13 }}>{route.route_label || route.route_key}</strong>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
              {route.stop_count} stops · {route.package_count} packages
            </span>
            <span style={{ color: route.open_count > 0 ? "#9a3412" : "#166534", fontSize: 12, fontWeight: 950 }}>
              {route.open_count > 0 ? `${route.open_count} open` : "Clear"} · {route.complete_count} complete
            </span>
          </div>
        ))}
      </div>
    </section>
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
