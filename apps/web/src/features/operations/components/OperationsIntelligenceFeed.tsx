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
  download_ms?: number | null;
  ingest_ms?: number | null;
  status: string;
  source_filename: string | null;
  batch_id: string | null;
  inserted_rows: number | null;
  route_count?: number | null;
  summary_rows?: number | null;
  matched_rows: number | null;
  unmatched_rows: number | null;
  error_message: string | null;
};

type RefreshStep = {
  ok: boolean;
  status: number;
  duration_ms: number;
  result?: {
    ingest?: {
      batch_id?: string | null;
      inserted_row_count?: number | null;
      matched_route_count?: number | null;
      unmatched_route_count?: number | null;
      row_classification?: { route_count?: number | null } | null;
      inserted_summary_row_count?: number | null;
    };
    error?: string;
    message?: string;
  };
};

type RefreshResult = {
  ok: boolean;
  automation_type: "OPERATIONS_REFRESH";
  duration_ms: number;
  steps: {
    dsw?: RefreshStep;
    fcc?: RefreshStep;
  };
};

type Props = {
  slug: string;
  serviceDate: string;
  surface: "dispatch" | "delivery-window";
  frozen?: boolean;
  title?: string;
};

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const normalized = value.includes("UTC") ? value.replace(" UTC", "Z") : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDuration(ms: number | null | undefined) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function shortBatch(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "—";
}

function sourceComplete(entry: IntelligenceEntry | null | undefined) {
  const status = String(entry?.status ?? "").toUpperCase();
  return Boolean(entry) && (!status || ["LOADED", "INGESTED", "COMPLETE", "COMPLETED", "SUCCESS"].includes(status));
}

function SourceSummary(props: {
  title: string;
  entry: IntelligenceEntry | null | undefined;
}) {
  const complete = sourceComplete(props.entry);
  const statusText = complete ? `✓ ${formatTime(props.entry?.timestamp)}` : props.entry ? "Needs review" : "Waiting";

  return (
    <div style={sourceBox}>
      <strong style={sourceTitle}>{props.title}</strong>
      <strong style={{ color: complete ? "#166534" : "#92400e", fontSize: 12 }}>
        {statusText}
      </strong>
    </div>
  );
}

function OutcomeColumn(props: {
  title: string;
  status?: string | null;
  lastUpload?: string | null;
  durationMs?: number | null;
  downloadMs?: number | null;
  ingestMs?: number | null;
  rows?: number | null;
  routeCount?: number | null;
  summaryRows?: number | null;
  matched?: number | null;
  unmatched?: number | null;
  batchId?: string | null;
  error?: string | null;
}) {
  const failed = props.status === "FAILED";

  return (
    <div style={sourceBox}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong style={sourceTitle}>{props.title}</strong>
        <span style={{ fontSize: 12, fontWeight: 950, color: failed ? "#991b1b" : "#166534" }}>
          {props.status ?? "—"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        <div style={summaryLine}><span style={summaryLabel}>Last Upload</span><strong>{formatTime(props.lastUpload)}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Duration</span><strong>{formatDuration(props.durationMs)}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Download</span><strong>{formatDuration(props.downloadMs)}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Import</span><strong>{formatDuration(props.ingestMs)}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Rows</span><strong>{props.rows ?? "—"}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Routes</span><strong>{props.routeCount ?? "—"}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Summary</span><strong>{props.summaryRows ?? "—"}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Matched</span><strong>{props.matched ?? "—"} / {props.unmatched ?? "—"}</strong></div>
        <div style={summaryLine}><span style={summaryLabel}>Batch</span><strong>{shortBatch(props.batchId)}</strong></div>
      </div>

      {props.error ? <p style={errorText}>{props.error}</p> : null}
    </div>
  );
}

export default function OperationsIntelligenceFeed(props: Props) {
  const { slug, serviceDate, surface, frozen = false, title = "Automated File System" } = props;
  const [sources, setSources] = useState<IntelligenceSource[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [runningOps, setRunningOps] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<RefreshResult | null>(null);
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

  const sourceByName = useMemo(() => {
    const map = new Map<string, IntelligenceSource>();
    for (const source of sources) map.set(source.source.toUpperCase(), source);
    return map;
  }, [sources]);

  const latestDswRun = runs.find((run) => run.automation_type === "DSW") ?? null;
  const latestFccRun = runs.find((run) => run.automation_type === "FCC") ?? null;
  const latestDswEntry = sourceByName.get("DSW")?.entries?.[0] ?? null;
  const latestFccEntry = sourceByName.get("FCC")?.entries?.[0] ?? null;

  const dswStep = lastRefresh?.steps?.dsw;
  const fccStep = lastRefresh?.steps?.fcc;

  const currentDswFailed = dswStep?.ok === false;
  const currentFccFailed = fccStep?.ok === false;

  const dswRows = currentDswFailed ? null : dswStep?.result?.ingest?.inserted_row_count ?? latestDswRun?.inserted_rows;
  const fccRows = currentFccFailed ? null : fccStep?.result?.ingest?.inserted_row_count ?? latestFccRun?.inserted_rows;
  const dswMatched = currentDswFailed ? null : dswStep?.result?.ingest?.matched_route_count ?? latestDswRun?.matched_rows;
  const fccMatched = currentFccFailed ? null : fccStep?.result?.ingest?.matched_route_count ?? latestFccRun?.matched_rows;
  const dswUnmatched = currentDswFailed ? null : dswStep?.result?.ingest?.unmatched_route_count ?? latestDswRun?.unmatched_rows;
  const fccUnmatched = currentFccFailed ? null : fccStep?.result?.ingest?.unmatched_route_count ?? latestFccRun?.unmatched_rows;

  const dswComplete = sourceComplete(latestDswEntry);
  const fccComplete = sourceComplete(latestFccEntry);
  const completedSourceCount = [dswComplete, fccComplete].filter(Boolean).length;
  const lastCompletedAt =
    [latestDswEntry?.timestamp, latestFccEntry?.timestamp]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const feedHealth = completedSourceCount === 2 ? "Healthy" : completedSourceCount > 0 ? "Partial" : "Waiting";

  const hasEntries = Boolean(latestDswEntry || latestFccEntry || latestDswRun || latestFccRun);

  async function updateOpsNow() {
    try {
      setRunningOps(true);
      setRunError(null);
      setOverlayOpen(true);

      const res = await fetch(`/api/company/${slug}/automation/run-operations-refresh`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setRunError(data?.error ?? data?.message ?? "Update Ops failed.");
      }

      setLastRefresh(data);
      await Promise.all([loadFeed(), loadRuns()]);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Update Ops failed.");
    } finally {
      setRunningOps(false);
    }
  }

  return (
    <section style={card}>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{title}</p>
          {frozen ? (
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12, fontWeight: 800 }}>
              Dispatch locked. Intelligence frozen.
            </p>
          ) : null}
        </div>

      </div>

      {!frozen && hasEntries ? (
        <button
          type="button"
          onClick={() => {
            void loadRuns();
            setOverlayOpen(true);
          }}
          style={feedSummaryButton}
        >
          <div style={summaryHeader}>
            <span>Last Run</span>
            <span>{formatTime(lastCompletedAt)} · {feedHealth}</span>
          </div>
          <SourceSummary title="DSW" entry={latestDswEntry} />
          <SourceSummary title="FCC" entry={latestFccEntry} />
        </button>
      ) : null}

      {error ? <p style={errorText}>{error}</p> : null}
      {runError ? <p style={errorText}>{runError}</p> : null}

      {!frozen && !hasEntries && !error ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
          No source updates yet.
        </p>
      ) : null}

      {overlayOpen ? (
        <div role="presentation" onClick={() => setOverlayOpen(false)} style={backdrop}>
          <section role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} style={dialog}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Automation inspection</p>
                <h2 className="app-card__title" style={{ margin: "4px 0 0" }}>Update Ops</h2>
              </div>
              <div className="cta-row" style={{ marginTop: 0 }}>
                <button type="button" className="button button-primary" disabled={runningOps} onClick={updateOpsNow}>
                  {runningOps ? "Updating..." : "Update Ops"}
                </button>
                <button type="button" className="button" onClick={() => setOverlayOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <section style={sectionBlock}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Outcome</p>
                <h3 className="app-card__title" style={{ fontSize: 16, margin: "2px 0 0" }}>
                  Latest automation result
                </h3>
              </div>

              <div style={twoCol}>
                <OutcomeColumn
                  title="DSW"
                  status={dswStep ? (dswStep.ok ? "SUCCESS" : "FAILED") : latestDswRun?.status}
                  lastUpload={currentDswFailed ? null : latestDswEntry?.timestamp ?? latestDswRun?.completed_at}
                  durationMs={dswStep?.duration_ms ?? latestDswRun?.duration_ms}
                  downloadMs={currentDswFailed ? null : latestDswRun?.download_ms}
                  ingestMs={currentDswFailed ? null : latestDswRun?.ingest_ms}
                  rows={dswRows}
                  routeCount={currentDswFailed ? null : dswStep?.result?.ingest?.row_classification?.route_count ?? latestDswRun?.route_count}
                  summaryRows={currentDswFailed ? null : dswStep?.result?.ingest?.inserted_summary_row_count ?? latestDswRun?.summary_rows}
                  matched={dswMatched}
                  unmatched={dswUnmatched}
                  batchId={currentDswFailed ? null : dswStep?.result?.ingest?.batch_id ?? latestDswRun?.batch_id}
                  error={dswStep?.result?.error ?? dswStep?.result?.message ?? latestDswRun?.error_message}
                />
                <OutcomeColumn
                  title="FCC"
                  status={fccStep ? (fccStep.ok ? "SUCCESS" : "FAILED") : latestFccRun?.status}
                  lastUpload={currentFccFailed ? null : latestFccEntry?.timestamp ?? latestFccRun?.completed_at}
                  durationMs={fccStep?.duration_ms ?? latestFccRun?.duration_ms}
                  downloadMs={currentFccFailed ? null : latestFccRun?.download_ms}
                  ingestMs={currentFccFailed ? null : latestFccRun?.ingest_ms}
                  rows={fccRows}
                  routeCount={currentFccFailed ? null : fccStep?.result?.ingest?.row_classification?.route_count ?? latestFccRun?.route_count}
                  summaryRows={currentFccFailed ? null : fccStep?.result?.ingest?.inserted_summary_row_count ?? latestFccRun?.summary_rows}
                  matched={fccMatched}
                  unmatched={fccUnmatched}
                  batchId={currentFccFailed ? null : fccStep?.result?.ingest?.batch_id ?? latestFccRun?.batch_id}
                  error={fccStep?.result?.error ?? fccStep?.result?.message ?? latestFccRun?.error_message}
                />
              </div>
            </section>

            <section style={sectionBlock}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Run history</p>
                <h3 className="app-card__title" style={{ fontSize: 16, margin: "2px 0 0" }}>Recent automation runs</h3>
              </div>

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
                        <td style={td}>{run.matched_rows ?? "—"} / {run.unmatched_rows ?? "—"}</td>
                        <td style={td}>{shortBatch(run.batch_id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </section>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 14,
  background: "#fff",
  padding: 10,
  display: "grid",
  gap: 8,
};

const feedSummaryButton: React.CSSProperties = {
  border: "1px solid #e6edf5",
  background: "#f8fafc",
  borderRadius: 12,
  padding: "8px 10px",
  display: "grid",
  gap: 4,
  cursor: "pointer",
  textAlign: "left",
};

const sourceBox: React.CSSProperties = {
  border: "0",
  borderRadius: 10,
  padding: "3px 2px",
  background: "transparent",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const sourceTitle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 12,
  letterSpacing: "0.06em",
};

const summaryHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#64748b",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "0 2px 2px",
};

const summaryLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#334155",
  fontSize: 11,
  fontWeight: 800,
};

const summaryLabel: React.CSSProperties = {
  color: "#64748b",
  fontWeight: 800,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const sectionBlock: React.CSSProperties = {
  border: "1px solid #eef3f8",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  background: "rgba(15, 23, 42, 0.35)",
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const dialog: React.CSSProperties = {
  width: "min(860px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto",
  borderRadius: 18,
  background: "#fff",
  border: "1px solid #d6dfeb",
  boxShadow: "0 24px 80px rgba(15,23,42,0.25)",
  padding: 16,
  display: "grid",
  gap: 12,
};

const errorText: React.CSSProperties = {
  margin: 0,
  color: "#991b1b",
  fontSize: 12,
  fontWeight: 800,
};

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
