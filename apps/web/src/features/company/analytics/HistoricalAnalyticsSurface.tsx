"use client";

import { useEffect, useMemo, useState } from "react";

type ReportHistoryRow = {
  batch_id: string;
  company_id: string;
  report_family_key: string | null;
  report_shape_key: string | null;
  service_date: string | null;
  report_frame: string | null;
  snapshot_kind: string;
  source_filename: string | null;
  row_count: number;
  route_row_count: number;
  participant_row_count: number;
  skipped_row_count: number;
  status: string;
  created_at: string;
  raw_row_count: number | string;
  matched_row_count: number | string;
  unmatched_row_count: number | string;
  summary_row_count: number | string;
  total_history_count: number | string;
};

type Props = {
  slug: string;
};

const PAGE_SIZE = 25;

function integer(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function shortBatch(value: string) {
  return value.slice(0, 8);
}

export default function HistoricalAnalyticsSurface({ slug }: Props) {
  const [family, setFamily] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ReportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });

        if (family) {
          params.set("family", family);
        }

        const response = await fetch(
          `/api/company/${slug}/operations/reports/history?${params.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const payload = await response.json();

        if (!active) return;

        if (!response.ok) {
          setRows([]);
          setError(payload?.error ?? "Failed to load report history.");
          return;
        }

        setRows(
          Array.isArray(payload?.rows)
            ? (payload.rows as ReportHistoryRow[])
            : []
        );
      } catch (caught) {
        if (!active) return;

        setRows([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load report history."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (slug) {
      void loadHistory();
    }

    return () => {
      active = false;
    };
  }, [family, offset, slug]);

  const total = rows.length
    ? integer(rows[0]?.total_history_count)
    : 0;

  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const canPrevious = offset > 0 && !loading;
  const canNext = offset + PAGE_SIZE < total && !loading;

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => {
        sum.rows += integer(row.raw_row_count);
        sum.routes += integer(row.route_row_count);
        sum.matched += integer(row.matched_row_count);
        sum.unmatched += integer(row.unmatched_row_count);
        return sum;
      },
      {
        rows: 0,
        routes: 0,
        matched: 0,
        unmatched: 0,
      }
    );
  }, [rows]);

  function selectFamily(value: string) {
    setFamily(value);
    setOffset(0);
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <article className="app-card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <p className="value-card__eyebrow">Analytics · Historical</p>
            <h2 className="app-card__title">Historical Analytics</h2>
            <p
              className="app-card__body"
              style={{ marginTop: 8, maxWidth: 840 }}
            >
              Governed report history across DSW, DRO, and FCC source evidence.
            </p>
          </div>

          <label
            style={{
              display: "grid",
              gap: 5,
              minWidth: 180,
              fontSize: 12,
              fontWeight: 800,
              color: "#475569",
            }}
          >
            Report family
            <select
              className="workspace-select"
              value={family}
              onChange={(event) => selectFamily(event.target.value)}
            >
              <option value="">All reports</option>
              <option value="DSW">DSW</option>
              <option value="DRO">DRO</option>
              <option value="FCC">FCC</option>
            </select>
          </label>
        </div>
      </article>

      <article className="app-card" style={{ padding: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
          }}
        >
          <div className="context-stat">
            <span>History records</span>
            <strong>{total}</strong>
          </div>

          <div className="context-stat">
            <span>Rows on page</span>
            <strong>{totals.rows}</strong>
          </div>

          <div className="context-stat">
            <span>Routes on page</span>
            <strong>{totals.routes}</strong>
          </div>

          <div className="context-stat">
            <span>Matched / unmatched</span>
            <strong>
              {totals.matched} / {totals.unmatched}
            </strong>
          </div>
        </div>
      </article>

      <article className="app-card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="value-card__eyebrow">Report history</p>
            <h3 className="app-card__title" style={{ fontSize: 18 }}>
              Governed source batches
            </h3>
          </div>

          <span
            style={{
              color: "#64748b",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Page {pageNumber} of {pageCount}
          </span>
        </div>

        {error ? (
          <p
            style={{
              margin: "14px 0 0",
              color: "#b91c1c",
              fontWeight: 700,
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1080,
              fontSize: 12,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "#64748b",
                }}
              >
                <th style={headerCell}>Service date</th>
                <th style={headerCell}>Family</th>
                <th style={headerCell}>Shape</th>
                <th style={headerCell}>Frame</th>
                <th style={headerCell}>Status</th>
                <th style={headerCell}>Rows</th>
                <th style={headerCell}>Routes</th>
                <th style={headerCell}>Matched</th>
                <th style={headerCell}>Unmatched</th>
                <th style={headerCell}>Summary</th>
                <th style={headerCell}>Created</th>
                <th style={headerCell}>Batch</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={emptyCell}>
                    Loading report history...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} style={emptyCell}>
                    No report history matches this view.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.batch_id}>
                    <td style={bodyCell}>
                      {formatDate(row.service_date)}
                    </td>
                    <td style={bodyCell}>
                      <strong>{row.report_family_key ?? "—"}</strong>
                    </td>
                    <td style={bodyCell}>
                      {row.report_shape_key ?? "—"}
                    </td>
                    <td style={bodyCell}>
                      {row.report_frame ?? "—"}
                    </td>
                    <td style={bodyCell}>{row.status}</td>
                    <td style={bodyCell}>
                      {integer(row.raw_row_count)}
                    </td>
                    <td style={bodyCell}>{row.route_row_count}</td>
                    <td style={bodyCell}>
                      {integer(row.matched_row_count)}
                    </td>
                    <td style={bodyCell}>
                      {integer(row.unmatched_row_count)}
                    </td>
                    <td style={bodyCell}>
                      {integer(row.summary_row_count)}
                    </td>
                    <td style={bodyCell}>
                      {formatTimestamp(row.created_at)}
                    </td>
                    <td style={bodyCell}>
                      <code>{shortBatch(row.batch_id)}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div
          className="cta-row"
          style={{
            marginTop: 14,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="button"
            disabled={!canPrevious}
            onClick={() =>
              setOffset((current) =>
                Math.max(current - PAGE_SIZE, 0)
              )
            }
          >
            Previous
          </button>

          <button
            type="button"
            className="button"
            disabled={!canNext}
            onClick={() =>
              setOffset((current) => current + PAGE_SIZE)
            }
          >
            Next
          </button>
        </div>
      </article>
    </section>
  );
}

const headerCell: React.CSSProperties = {
  padding: "10px 9px",
  borderBottom: "1px solid #dbe4ee",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontSize: 11,
};

const bodyCell: React.CSSProperties = {
  padding: "10px 9px",
  borderBottom: "1px solid #e6edf5",
  color: "#334155",
  whiteSpace: "nowrap",
};

const emptyCell: React.CSSProperties = {
  padding: 28,
  color: "#64748b",
  textAlign: "center",
};
