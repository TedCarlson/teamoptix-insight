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
  packages: ExpressPackageRow[];
  error?: string;
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

function fmtAddress(row: ExpressPackageRow) {
  return [
    row.address_line_1,
    row.address_line_2,
    [row.city, row.state, row.postal_code].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function completedLabel(value: string | null) {
  return String(value ?? "").trim().toUpperCase() === "Y" ? "Complete" : "Open";
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

  const routeSummaries = payload?.route_summaries ?? [];

  const packagesByRoute = useMemo(() => {
    const grouped = new Map<string, ExpressPackageRow[]>();

    for (const row of payload?.packages ?? []) {
      const key = row.route_key || "unknown";
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    return grouped;
  }, [payload?.packages]);

  useEffect(() => {
    if (!open || !slug || !serviceDate) return;

    let active = true;

    async function loadExpressReport() {
      setLoading(true);
      setError(null);

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

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${surfaceLabel} Express Report`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <section
        style={{
          width: "min(760px, 100vw)",
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
              {surfaceLabel} · Express Report
            </p>
            <h2 style={{ margin: 0, fontSize: 22 }}>Protected service exposure</h2>
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

        {loading ? (
          <div style={{ padding: 14, color: "#64748b", fontWeight: 900 }}>
            Loading Express report...
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 14,
              padding: 12,
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {error}
          </div>
        ) : null}

        {payload?.totals ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 8,
            }}
          >
            {[
              ["Routes", payload.totals.route_count],
              ["Express Pkgs", payload.totals.express_package_count],
              ["Express Stops", payload.totals.express_stop_count],
              ["Open", payload.totals.incomplete_express_package_count],
              ["Complete", payload.totals.completed_express_package_count],
            ].map(([label, value]) => (
              <div
                key={label}
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
                  {label}
                </span>
                <strong style={{ fontSize: 18 }}>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {payload?.freshness ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 800 }}>
            Latest processed {fmtDateTime(payload.freshness.latest_processed_at)}
          </p>
        ) : null}

        {!loading && payload && routeSummaries.length === 0 ? (
          <div style={{ padding: 14, color: "#64748b", fontWeight: 900 }}>
            No Express packages found for this service date.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {routeSummaries.map((route) => {
            const routePackages = packagesByRoute.get(route.route_key) ?? [];

            return (
              <section
                key={`${route.capture_plan_id ?? ""}-${route.route_key}`}
                style={{
                  border: "1px solid #e5ecf6",
                  borderRadius: 16,
                  background: "#fff",
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong style={{ display: "block" }}>
                      {route.route_label || route.route_key}
                    </strong>
                    <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                      {route.express_package_count} packages · {route.express_stop_count} stops
                    </span>
                  </div>

                  <span
                    style={{
                      border: "1px solid #fed7aa",
                      background:
                        route.incomplete_express_package_count > 0 ? "#fff7ed" : "#ecfdf5",
                      color:
                        route.incomplete_express_package_count > 0 ? "#9a3412" : "#166534",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 950,
                    }}
                  >
                    {route.incomplete_express_package_count > 0
                      ? `${route.incomplete_express_package_count} open`
                      : "Clear"}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {routePackages.map((pkg) => (
                    <div
                      key={`${pkg.route_key}-${pkg.tracking_id}-${pkg.st_number}-${pkg.sid}`}
                      style={{
                        border: "1px solid #edf2f7",
                        borderRadius: 12,
                        padding: "8px 10px",
                        display: "grid",
                        gap: 3,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        <span>{pkg.tracking_id || "No tracking ID"}</span>
                        <span
                          style={{
                            color:
                              completedLabel(pkg.completed) === "Complete"
                                ? "#166534"
                                : "#9a3412",
                          }}
                        >
                          {completedLabel(pkg.completed)}
                        </span>
                      </div>
                      <div style={{ color: "#334155", fontSize: 12, fontWeight: 800 }}>
                        {pkg.prem_svc_raw || "Express"}
                        {pkg.delivery_time_begin || pkg.delivery_time_end
                          ? ` · ${pkg.delivery_time_begin || "—"}–${pkg.delivery_time_end || "—"}`
                          : ""}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 750 }}>
                        {pkg.recipient || "No recipient"} · {fmtAddress(pkg) || "No address"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
