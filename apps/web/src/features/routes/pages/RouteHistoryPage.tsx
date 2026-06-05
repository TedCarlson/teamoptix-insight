"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type RouteHistoryRow = {
  id: string;
  route_name: string;
  current_wa_num: string | null;
  threshold_stops: number | null;
  threshold_rate: number | null;
  route_location: string | null;
  route_type: string;
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
  rotation_name: string | null;
  is_active: boolean;
  effective_start: string;
  effective_end: string | null;
};

function formatRouteType(value: string) {
  if (!value) return "";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function dayCell(active: boolean) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 28,
        height: 22,
        padding: "0 6px",
        borderRadius: 999,
        border: `1px solid ${active ? "#7bc48a" : "#d6dfeb"}`,
        background: active ? "#e8f6eb" : "#f8fafc",
        color: active ? "#2f8f46" : "#64748b",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {active ? "Y" : "—"}
    </span>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
};

const compactCellStyle: React.CSSProperties = {
  padding: "8px 2px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  textAlign: "center",
};

const headerBaseStyle: React.CSSProperties = {
  borderBottom: "1px solid #d6dfeb",
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#5c6b84",
  verticalAlign: "middle",
};

const headerStyle: React.CSSProperties = {
  ...headerBaseStyle,
  textAlign: "left",
  padding: "10px 10px",
};

const headerStyleCompact: React.CSSProperties = {
  ...headerBaseStyle,
  textAlign: "center",
  padding: "10px 2px",
};

export default function RouteHistoryPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [rows, setRows] = useState<RouteHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState("");
  const [cloneBusyId, setCloneBusyId] = useState<string | null>(null);

  async function loadHistory() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/routes/history`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load route history.");
        setRows([]);
        return;
      }

      setRows((data?.routes ?? []) as RouteHistoryRow[]);
    } catch {
      setError("Failed to load route history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const filteredRows = useMemo(() => {
    const q = routeFilter.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      return (
        row.route_name.toLowerCase().includes(q) ||
        (row.current_wa_num ?? "").toLowerCase().includes(q) ||
        (row.route_location ?? "").toLowerCase().includes(q) ||
        row.route_type.toLowerCase().includes(q) ||
        (row.rotation_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, routeFilter]);

  async function handleClone(row: RouteHistoryRow) {
    try {
      setCloneBusyId(row.id);
      setError(null);

      const res = await fetch(`/api/company/${slug}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          route_name: row.route_name,
          current_wa_num: row.current_wa_num ?? "",
          threshold_stops:
            row.threshold_stops != null ? String(row.threshold_stops) : "",
          threshold_rate:
            row.threshold_rate != null ? String(row.threshold_rate) : "",
          route_location: row.route_location ?? "",
          route_type: row.route_type,
          runs_s: row.runs_s,
          runs_u: row.runs_u,
          runs_m: row.runs_m,
          runs_t: row.runs_t,
          runs_w: row.runs_w,
          runs_h: row.runs_h,
          runs_f: row.runs_f,
          rotation_name: row.rotation_name ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to clone route into current baseline.");
        return;
      }

      await loadHistory();
    } catch {
      setError("Failed to clone route into current baseline.");
    } finally {
      setCloneBusyId(null);
    }
  }

  return (
    <main className="workspace-shell">

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Routes</p>
            <h2 className="value-card__title">Route history</h2>
            <p className="value-card__body">
              Read-only baseline history for route posture over time. Clone any
              prior row into the current baseline when needed.
            </p>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}/routes`}>
                Back to routes
              </Link>
              <Link className="button" href={`/company/${slug}/schedule`}>
                Schedule
              </Link>
            </div>
          </article>

          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">History</p>
            <h3 className="value-card__title">Previous route shapes</h3>

            <div style={{ marginTop: 16, maxWidth: 320 }}>
              <input
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                placeholder="Search route, WA#, location, type"
                style={{
                  height: 40,
                  width: "100%",
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid #d6dfeb",
                  background: "#fff",
                }}
              />
            </div>

            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>

                <thead>
                  <tr>
                    <th style={headerStyle}>Route</th>
                    <th style={headerStyle}>WA#</th>
                    <th style={headerStyle}>Tshld</th>
                    <th style={headerStyle}>Tshld $</th>
                    <th style={headerStyle}>Location</th>
                    <th style={headerStyleCompact}>S</th>
                    <th style={headerStyleCompact}>U</th>
                    <th style={headerStyleCompact}>M</th>
                    <th style={headerStyleCompact}>T</th>
                    <th style={headerStyleCompact}>W</th>
                    <th style={headerStyleCompact}>H</th>
                    <th style={headerStyleCompact}>F</th>
                    <th style={headerStyle}>Rotation</th>
                    <th style={headerStyle}>Start</th>
                    <th style={headerStyle}>End</th>
                    <th style={headerStyle}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={16} style={{ padding: 24 }}>
                        Loading history...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={16} style={{ padding: 24 }}>
                        No history rows match the current view.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td style={cellStyle}>
                          <div style={{ display: "grid", gap: 2 }}>
                            <span>{row.route_name}</span>
                            <span
                              style={{
                                fontSize: 11,
                                lineHeight: 1.2,
                                color: "#7b879c",
                                textTransform: "none",
                              }}
                            >
                              {formatRouteType(row.route_type)}
                            </span>
                          </div>
                        </td>
                        <td style={cellStyle}>{row.current_wa_num ?? "—"}</td>
                        <td style={cellStyle}>
                          {row.threshold_stops ?? "—"}
                        </td>
                        <td style={cellStyle}>
                          {row.threshold_rate != null
                            ? `$${Number(row.threshold_rate).toFixed(2)}`
                            : "—"}
                        </td>
                        <td style={cellStyle}>{row.route_location ?? "—"}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_s)}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_u)}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_m)}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_t)}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_w)}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_h)}</td>
                        <td style={compactCellStyle}>{dayCell(row.runs_f)}</td>
                        <td style={cellStyle}>{row.rotation_name ?? "—"}</td>
                        <td style={cellStyle}>{row.effective_start}</td>
                        <td style={cellStyle}>{row.effective_end ?? "Current"}</td>
                        <td style={cellStyle}>
                          <button
                            className="button"
                            type="button"
                            disabled={cloneBusyId === row.id}
                            onClick={() => handleClone(row)}
                          >
                            {cloneBusyId === row.id ? "Cloning..." : "Clone"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}