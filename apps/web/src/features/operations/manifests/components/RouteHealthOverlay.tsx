"use client";

import { useEffect, useState, type ReactNode } from "react";

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
    completed_package_count: number;
    incomplete_package_count: number;
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
  health: ManifestRouteHealthCard | null;
  onClose: () => void;
};

type RouteDetailPayload = {
  delivery_stops: Array<Record<string, unknown>>;
  packages: Array<Record<string, unknown>>;
  pickups: Array<Record<string, unknown>>;
  error?: string;
};

function statusTone(status: string | null | undefined) {
  switch (status) {
    case "EXPRESS_OPEN":
      return { border: "#fed7aa", bg: "#fff7ed", color: "#9a3412" };
    case "DELIVERY_OPEN":
    case "PICKUP_SHORT":
    case "MISSING_ARTIFACT":
    case "PROCESSING":
      return { border: "#fde68a", bg: "#fffbeb", color: "#92400e" };
    case "FAILED":
      return { border: "#fecaca", bg: "#fef2f2", color: "#991b1b" };
    case "CLEAR":
      return { border: "#bbf7d0", bg: "#ecfdf5", color: "#166534" };
    default:
      return { border: "#e5ecf6", bg: "#f8fafc", color: "#334155" };
  }
}

function formatDateTime(value: string | null | undefined) {
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

function StatCard(props: { label: string; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid #e5ecf6",
        borderRadius: 14,
        background: "#fff",
        padding: "10px 12px",
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
          letterSpacing: "0.06em",
        }}
      >
        {props.label}
      </span>
      <strong style={{ fontSize: 18 }}>{props.value}</strong>
    </div>
  );
}

export default function RouteHealthOverlay({
  open,
  slug,
  serviceDate,
  routeLabel,
  health,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<RouteDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const routeKey = health?.route_key ?? null;

  useEffect(() => {
    if (!open || !routeKey) return;
    let active = true;
    const selectedRouteKey = routeKey;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const response = await fetch(
          `/api/company/${slug}/operations/route-health?serviceDate=${encodeURIComponent(serviceDate)}&routeKey=${encodeURIComponent(selectedRouteKey)}`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = (await response.json()) as RouteDetailPayload;
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load route detail.");
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
  }, [open, routeKey, serviceDate, slug]);

  if (!open) return null;

  const tone = statusTone(health?.status);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Route Health"
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
        style={{
          width: "min(620px, 100vw)",
          height: "100%",
          background: "#f8fafc",
          boxShadow: "-24px 0 60px rgba(15, 23, 42, 0.24)",
          padding: 18,
          overflow: "auto",
          display: "grid",
          alignContent: "start",
          gap: 12,
        }}
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
              Service · Route Health
            </p>
            <h2 style={{ margin: 0, fontSize: 22 }}>{routeLabel}</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, fontWeight: 800 }}>
              Service date {serviceDate}
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

        {!health ? (
          <div
            style={{
              border: "1px solid #e5ecf6",
              borderRadius: 16,
              background: "#fff",
              padding: 14,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 850,
              lineHeight: 1.5,
            }}
          >
            No manifest route-health record is linked to this Service row yet. The route can still show
            FCC signal health, DSW progress, and completion. Manifest health appears after Delivery and
            Pickup manifests are captured, normalized, and matched to this route key.
          </div>
        ) : (
          <>
            <div
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                color: tone.color,
                borderRadius: 16,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: 16 }}>{health.status}</strong>
                <span style={{ fontSize: 12, fontWeight: 900 }}>
                  Severity {health.severity}
                </span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 950 }}>
                Processed {formatDateTime(health.artifacts.latest_processed_at)}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 8,
              }}
            >
              <StatCard label="Del Stops" value={health.delivery.stop_count} />
              <StatCard label="Del Pkgs" value={health.delivery.package_count} />
              <StatCard label="Express Pkgs" value={health.express.package_count} />
              <StatCard label="Express Open" value={health.express.incomplete_package_count} />
              <StatCard label="Pickups" value={health.pickup.stop_count} />
              <StatCard
                label="Pickup Pkgs"
                value={`${health.pickup.actual_package_count} / ${health.pickup.expected_package_count}`}
              />
            </div>

            <section
              style={{
                border: "1px solid #e5ecf6",
                borderRadius: 16,
                background: "#fff",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <strong>Manifest artifacts</strong>
              <div style={{ color: "#64748b", fontSize: 13, fontWeight: 850 }}>
                Delivery: {health.artifacts.delivery_status ?? "—"} · Pickup:{" "}
                {health.artifacts.pickup_status ?? "—"}
              </div>
              <div style={{ color: "#64748b", fontSize: 13, fontWeight: 850 }}>
                Captured {formatDateTime(health.artifacts.latest_captured_at)} · Processed{" "}
                {formatDateTime(health.artifacts.latest_processed_at)}
              </div>
            </section>

            <section
              style={{
                border: "1px solid #e5ecf6",
                borderRadius: 16,
                background: "#fff",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <strong>Flags</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(health.flags ?? {}).map(([key, value]) => (
                  <span
                    key={key}
                    style={{
                      border: "1px solid #e5ecf6",
                      borderRadius: 999,
                      padding: "5px 8px",
                      color: value ? "#166534" : "#64748b",
                      background: value ? "#ecfdf5" : "#f8fafc",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {key.replaceAll("_", " ")}: {String(Boolean(value))}
                  </span>
                ))}
              </div>
            </section>

            <RouteManifestDetail
              detail={detail}
              loading={detailLoading}
              error={detailError}
            />
          </>
        )}
      </section>
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

function DetailSection(props: {
  title: string;
  count: number;
  rows: Array<Record<string, unknown>>;
  render: (row: Record<string, unknown>, index: number) => ReactNode;
}) {
  return (
    <details open style={{ border: "1px solid #e5ecf6", borderRadius: 16, background: "#fff" }}>
      <summary style={{ padding: 12, cursor: "pointer", fontWeight: 950 }}>
        {props.title} · {props.count}
      </summary>
      <div style={{ borderTop: "1px solid #e5ecf6", maxHeight: 300, overflow: "auto" }}>
        {props.rows.length ? props.rows.map(props.render) : (
          <div style={{ padding: 12, color: "#64748b", fontSize: 13 }}>No rows recorded.</div>
        )}
      </div>
    </details>
  );
}

function RouteManifestDetail(props: {
  detail: RouteDetailPayload | null;
  loading: boolean;
  error: string | null;
}) {
  if (props.loading) return <div style={{ padding: 12, color: "#64748b" }}>Loading manifest rows…</div>;
  if (props.error) return <div style={{ padding: 12, color: "#991b1b" }}>{props.error}</div>;
  if (!props.detail) return null;

  const rowStyle = {
    padding: "10px 12px",
    borderBottom: "1px solid #eef2f7",
    display: "grid",
    gap: 3,
    fontSize: 12,
  } as const;

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div>
        <strong style={{ fontSize: 16 }}>Route manifest rows</strong>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
          Canonical in-day delivery, package, and pickup facts for this route.
        </div>
      </div>
      <DetailSection title="Delivery stops" count={props.detail.delivery_stops.length} rows={props.detail.delivery_stops}
        render={(row, index) => (
          <div key={`${value(row, "st_number")}-${value(row, "sid")}-${index}`} style={rowStyle}>
            <strong>Stop {value(row, "st_number")} · SID {value(row, "sid")}</strong>
            <span>{value(row, "recipient")} · {value(row, "package_count")} packages · Completed {value(row, "completed")}</span>
            <span style={{ color: "#64748b" }}>{address(row)}</span>
          </div>
        )} />
      <DetailSection title="Packages" count={props.detail.packages.length} rows={props.detail.packages}
        render={(row, index) => (
          <div key={`${value(row, "tracking_id")}-${index}`} style={rowStyle}>
            <strong>{value(row, "tracking_id")} · Stop {value(row, "st_number")}</strong>
            <span>{value(row, "recipient")} · Service {value(row, "prem_svc_raw")}</span>
            <span style={{ color: "#64748b" }}>Express {value(row, "is_express")} · Signature {value(row, "is_signature")} · Hazmat {value(row, "is_hazmat")}</span>
          </div>
        )} />
      <DetailSection title="Pickups" count={props.detail.pickups.length} rows={props.detail.pickups}
        render={(row, index) => (
          <div key={`${value(row, "puid")}-${index}`} style={rowStyle}>
            <strong>{value(row, "shipper_name")} · PUID {value(row, "puid")}</strong>
            <span>{value(row, "ready_at")}–{value(row, "close_at")} · {value(row, "packages_picked_up")} / {value(row, "package_count_expected")} packages</span>
            <span style={{ color: "#64748b" }}>{address(row)}</span>
          </div>
        )} />
    </section>
  );
}
