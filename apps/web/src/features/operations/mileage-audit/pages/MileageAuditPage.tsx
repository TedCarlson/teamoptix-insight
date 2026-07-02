"use client";

import { useEffect, useMemo, useState } from "react";

type Props = { slug: string };

type MileageAuditRow = {
  raw_row_id: string;
  service_date: string;
  route_name: string | null;
  wa_number: string | null;
  driver_name: string | null;
  recorded_miles_text: string | null;
  recorded_miles: number | null;
  suggested_miles: number | null;
  reason: string;
  sample_size: number;
};

function fmt(value: unknown, digits = 1) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export default function MileageAuditPage({ slug }: Props) {
  const [rows, setRows] = useState<MileageAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAppliedCount, setLastAppliedCount] = useState<number | null>(null);

  async function loadAudit(showLoading = true) {
    if (showLoading) setLoading(true);
    setError(null);

    const res = await fetch(`/api/company/${slug}/operations/mileage-audit?threshold=500`, {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setRows([]);
      setError(data?.error ?? "Failed to load mileage audit.");
      setLoading(false);
      return;
    }

    setRows(Array.isArray(data?.rows) ? data.rows : []);
    setLoading(false);
  }

  async function applySuggested() {
    setApplying(true);
    setError(null);

    const res = await fetch(`/api/company/${slug}/operations/mileage-audit`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold: 500, minSampleSize: 1 }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data?.error ?? "Failed to apply mileage corrections.");
      setApplying(false);
      return;
    }

    setLastAppliedCount(Number(data?.corrected_count ?? 0));
    await loadAudit();
    setApplying(false);
  }

  useEffect(() => {
    let active = true;

    async function hydrateAudit() {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/operations/mileage-audit?threshold=500`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!active) return;

      if (!res.ok) {
        setRows([]);
        setError(data?.error ?? "Failed to load mileage audit.");
        setLoading(false);
        return;
      }

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setLoading(false);
    }

    void hydrateAudit();

    return () => {
      active = false;
    };
  }, [slug]);

  const summary = useMemo(() => {
    const impossible = rows.filter((row) => row.reason === "IMPOSSIBLE_MILEAGE").length;
    const missing = rows.filter((row) => row.reason === "MISSING_MILEAGE").length;
    const healable = rows.filter((row) => row.suggested_miles != null).length;
    const manual = rows.length - healable;

    return { impossible, missing, healable, manual };
  }, [rows]);

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 8, display: "grid", gap: 10 }}>
        <header
          style={{
            border: "1px solid #d7e2f2",
            borderRadius: 14,
            background: "#fff",
            padding: "12px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div>
            <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Operations Tool
            </p>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>Mileage Audit</h1>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, fontWeight: 850 }}>
              Review impossible or missing DSW mileage records and apply route-median corrections with an audit trail.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="button" onClick={() => void loadAudit()} disabled={loading || applying} style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }}>
              Refresh
            </button>
            <button type="button" className="button button-primary" onClick={applySuggested} disabled={loading || applying || summary.healable === 0} style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }}>
              {applying
                ? "Applying..."
                : summary.healable > 0
                  ? `Apply Suggested (${summary.healable})`
                  : `Manual Review Required (${rows.length})`}
            </button>
          </div>
        </header>

        {error ? (
          <section style={{ border: "1px solid #fecaca", borderRadius: 14, background: "#fef2f2", color: "#991b1b", padding: 12, fontWeight: 900 }}>
            {error}
          </section>
        ) : null}

        {lastAppliedCount !== null ? (
          <section style={{ border: "1px solid #bbf7d0", borderRadius: 14, background: "#f0fdf4", color: "#166534", padding: 12, fontWeight: 900 }}>
            Applied {lastAppliedCount} mileage corrections.
          </section>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <MetricCard label="Total Findings" value={rows.length} />
          <MetricCard label="Impossible" value={summary.impossible} />
          <MetricCard label="Missing" value={summary.missing} />
          <MetricCard label="Manual Review" value={summary.manual} />
        </section>

        <section style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #e6edf5", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Audit Queue
              </p>
              <strong>{rows.length} mileage records detected</strong>
            </div>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
              Threshold: over 500 miles
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left" }}>
                  <th style={th}>Date</th>
                  <th style={th}>Route</th>
                  <th style={th}>Driver</th>
                  <th style={th}>Recorded</th>
                  <th style={th}>Suggested</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Sample</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, color: "#64748b", fontWeight: 850 }}>
                      Loading mileage audit...
                    </td>
                  </tr>
                ) : null}

                {!loading && rows.map((row) => (
                  <tr key={row.raw_row_id} style={{ borderBottom: "1px solid #eef2f7" }}>
                    <td style={tdStrong}>{row.service_date}</td>
                    <td style={tdStrong}>
                      {row.route_name ?? "Unlabeled"}{row.wa_number ? ` · ${row.wa_number}` : ""}
                    </td>
                    <td style={tdMuted}>{row.driver_name || "—"}</td>
                    <td style={{ ...tdStrong, color: "#991b1b" }}>{row.recorded_miles_text ?? "Missing"}</td>
                    <td style={{ ...tdStrong, color: "#166534" }}>{row.suggested_miles == null ? "—" : fmt(row.suggested_miles)}</td>
                    <td style={td}>{row.reason}</td>
                    <td style={td}>{row.sample_size}</td>
                  </tr>
                ))}

                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, color: "#166534", fontWeight: 900 }}>
                      No mileage anomalies detected.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function MetricCard(props: { label: string; value: number }) {
  return (
    <section style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", padding: 12 }}>
      <p style={{ margin: "0 0 6px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {props.label}
      </p>
      <strong style={{ display: "block", fontSize: 24, lineHeight: 1 }}>{props.value.toLocaleString()}</strong>
    </section>
  );
}

const th = {
  padding: "9px 10px",
  borderBottom: "1px solid #e6edf5",
} as const;

const td = {
  padding: "8px 10px",
} as const;

const tdStrong = {
  ...td,
  fontWeight: 900,
} as const;

const tdMuted = {
  ...td,
  color: "#475569",
} as const;
