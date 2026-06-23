"use client";

import { useEffect, useMemo, useState } from "react";

type IntelligenceEntry = {
  id: string;
  timestamp: string | null;
  label: string;
  service_date?: string | null;
  status?: string | null;
};

type IntelligenceSource = {
  source: string;
  entries: IntelligenceEntry[];
};

type AutomationRun = {
  id: string;
  automation_type: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  source_filename: string | null;
  batch_id: string | null;
  inserted_rows: number | null;
  matched_rows: number | null;
  unmatched_rows: number | null;
  error_message: string | null;
};

type Props = {
  slug: string;
  serviceDate: string;
  surface: "dispatch" | "delivery-window";
  frozen?: boolean;
  title?: string;
};

function formatTime(value: string | null) {
  if (!value) return "—";
  const normalized = value.includes("UTC") ? value.replace(" UTC", "Z") : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDuration(ms: number | null) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function Stat(props: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="context-stat" style={{ padding: "9px 10px" }}>
      <span className="context-stat__label">{props.label}</span>
      <strong>{props.value ?? "—"}</strong>
    </div>
  );
}

export default function OperationsIntelligenceFeed(props: Props) {
  const { slug, serviceDate, surface, frozen = false, title = "Intelligence Feed" } = props;
  const [sources, setSources] = useState<IntelligenceSource[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [runningDsw, setRunningDsw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function loadFeed(active = true) {
    try {
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/operations/reports/intelligence-feed?date=${serviceDate}&surface=${surface}`,
        { credentials: "include", cache: "no-store" }
      );

      const data = await res.json();

      if (!active) return;

      if (!res.ok) {
        setSources([]);
        setError(data?.error ?? "Failed to load intelligence feed.");
        return;
      }

      setSources(data?.sources ?? []);
    } catch (err) {
      if (!active) return;
      setSources([]);
      setError(err instanceof Error ? err.message : "Failed to load intelligence feed.");
    }
  }

  async function loadRuns(active = true) {
    try {
      const res = await fetch(`/api/company/${slug}/automation/runs?limit=12`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!active) return;

      if (!res.ok) {
        setRunError(data?.error ?? "Failed to load automation runs.");
        setRuns([]);
        return;
      }

      setRunError(null);
      setRuns(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      if (!active) return;
      setRunError(err instanceof Error ? err.message : "Failed to load automation runs.");
      setRuns([]);
    }
  }

  useEffect(() => {
    if (frozen) return;

    let active = true;

    if (slug && serviceDate) {
      void loadFeed(active);
      void loadRuns(active);
    }

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, serviceDate, slug, surface]);

  const hasEntries = useMemo(
    () => sources.some((source) => source.entries.length > 0),
    [sources]
  );

  const latestRun = runs[0] ?? null;

  async function runDswNow() {
    try {
      setRunningDsw(true);
      setRunError(null);

      const res = await fetch(`/api/company/${slug}/automation/discover`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setRunError(data?.error ?? data?.message ?? "DSW automation failed.");
        return;
      }

      await Promise.all([loadFeed(), loadRuns()]);
      setOverlayOpen(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "DSW automation failed.");
    } finally {
      setRunningDsw(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid #e6edf5",
        borderRadius: 14,
        background: "#fff",
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            {title}
          </p>
          {frozen ? (
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12, fontWeight: 800 }}>
              Dispatch locked. Intelligence frozen.
            </p>
          ) : null}
        </div>

        {!frozen ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              void loadRuns();
              setOverlayOpen(true);
            }}
            style={{ minHeight: 34, padding: "0 12px", fontSize: 12, width: "100%" }}
          >
            Automation
          </button>
        ) : null}
      </div>

      {latestRun ? (
        <button
          type="button"
          className="button"
          onClick={() => setOverlayOpen(true)}
          style={{
            justifyContent: "space-between",
            minHeight: 38,
            padding: "0 10px",
            fontSize: 12,
            borderColor: latestRun.status === "SUCCESS" ? "#bbf7d0" : latestRun.status === "FAILED" ? "#fecaca" : "#dbeafe",
            background: latestRun.status === "SUCCESS" ? "#f0fdf4" : latestRun.status === "FAILED" ? "#fef2f2" : "#eff6ff",
          }}
        >
          <span>{latestRun.automation_type} · {latestRun.status}</span>
          <span>{formatDuration(latestRun.duration_ms)}</span>
        </button>
      ) : null}

      {error ? (
        <p style={{ margin: 0, color: "#991b1b", fontSize: 12, fontWeight: 800 }}>
          {error}
        </p>
      ) : null}

      {runError ? (
        <p style={{ margin: 0, color: "#991b1b", fontSize: 12, fontWeight: 800 }}>
          {runError}
        </p>
      ) : null}

      {!frozen && !hasEntries && !error ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
          No source updates yet.
        </p>
      ) : null}

      {!frozen
        ? sources.map((source) => (
            <div key={source.source} style={{ display: "grid", gap: 5 }}>
              <strong
                style={{
                  color: "#334155",
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {source.source}
              </strong>

              {source.entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    void loadRuns();
                    setOverlayOpen(true);
                  }}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    color: "#64748b",
                    fontSize: 12,
                    fontWeight: 850,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: "#0f172a" }}>{formatTime(entry.timestamp)}</span>
                  <span style={{ textAlign: "right" }}>{entry.label}</span>
                </button>
              ))}
            </div>
          ))
        : null}

      {overlayOpen ? (
        <div
          role="presentation"
          onClick={() => setOverlayOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(15, 23, 42, 0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(760px, 100%)",
              maxHeight: "calc(100vh - 32px)",
              overflow: "auto",
              borderRadius: 18,
              background: "#fff",
              border: "1px solid #d6dfeb",
              boxShadow: "0 24px 80px rgba(15,23,42,0.25)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Automation inspection</p>
                <h2 className="app-card__title" style={{ margin: "4px 0 0" }}>Run history</h2>
              </div>
              <div className="cta-row" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={runningDsw}
                  onClick={runDswNow}
                >
                  {runningDsw ? "Running..." : "Run DSW"}
                </button>
                <button type="button" className="button" onClick={() => setOverlayOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            {latestRun ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <Stat label="Latest" value={`${latestRun.automation_type} · ${latestRun.status}`} />
                <Stat label="Duration" value={formatDuration(latestRun.duration_ms)} />
                <Stat label="Rows" value={latestRun.inserted_rows} />
                <Stat label="Matched" value={latestRun.matched_rows} />
              </div>
            ) : (
              <p className="app-card__body" style={{ margin: 0 }}>No automation runs recorded yet.</p>
            )}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={th}>Started</th>
                    <th style={th}>Type</th>
                    <th style={th}>Status</th>
                    <th style={th}>Duration</th>
                    <th style={th}>Rows</th>
                    <th style={th}>Match</th>
                    <th style={th}>Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td style={td}>{formatTime(run.started_at)}</td>
                      <td style={td}>{run.automation_type}</td>
                      <td style={td}>{run.status}</td>
                      <td style={td}>{formatDuration(run.duration_ms)}</td>
                      <td style={td}>{run.inserted_rows ?? "—"}</td>
                      <td style={td}>
                        {run.matched_rows ?? "—"} / {run.unmatched_rows ?? "—"}
                      </td>
                      <td style={td}>{run.batch_id ? run.batch_id.slice(0, 8) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {runs.find((run) => run.error_message) ? (
              <p style={{ color: "#991b1b", fontSize: 12, fontWeight: 800, margin: 0 }}>
                {runs.find((run) => run.error_message)?.error_message}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

const th: React.CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #e6edf5",
};

const td: React.CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #eef3f8",
  color: "#334155",
  fontWeight: 800,
};
