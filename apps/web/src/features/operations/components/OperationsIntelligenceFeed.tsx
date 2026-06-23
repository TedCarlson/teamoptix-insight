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
  result?: any;
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

function formatTime(value: string | null) {
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

function SourceSummary(props: {
  title: string;
  updatedAt: string | null;
  rows?: number | null;
  matched?: number | null;
  unmatched?: number | null;
}) {
  return (
    <div style={sourceBox}>
      <strong style={sourceTitle}>{props.title}</strong>
      <div style={summaryLine}>
        <span style={summaryLabel}>Last Upload</span>
        <strong>{formatTime(props.updatedAt)}</strong>
      </div>
      <div style={summaryLine}>
        <span style={summaryLabel}>Rows</span>
        <strong>{props.rows ?? "—"}</strong>
      </div>
      <div style={summaryLine}>
        <span style={summaryLabel}>Matched</span>
        <strong>
          {props.matched ?? "—"} / {props.unmatched ?? "—"}
        </strong>
      </div>
    </div>
  );
}

function RuntimeColumn(props: {
  title: string;
  status?: string;
  totalMs?: number | null;
  rows?: number | null;
  matched?: number | null;
  unmatched?: number | null;
  steps: Array<{ label: string; ms?: number | null; status?: "done" | "active" | "pending" | "failed" }>;
}) {
  return (
    <div style={sourceBox}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong style={sourceTitle}>{props.title}</strong>
        <span style={{ fontSize: 12, fontWeight: 900, color: props.status === "FAILED" ? "#991b1b" : "#166534" }}>
          {props.status ?? "—"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {props.steps.map((step) => (
          <div key={step.label} style={runtimeLine}>
            <span>
              {step.status === "failed" ? "✕" : step.status === "active" ? "⟳" : step.status === "pending" ? "·" : "✓"}{" "}
              {step.label}
            </span>
            <strong>{formatDuration(step.ms)}</strong>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #e6edf5", marginTop: 10, paddingTop: 8, display: "grid", gap: 4 }}>
        <div style={runtimeLine}>
          <span>Total</span>
          <strong>{formatDuration(props.totalMs)}</strong>
        </div>
        <div style={runtimeLine}>
          <span>Rows</span>
          <strong>{props.rows ?? "—"}</strong>
        </div>
        <div style={runtimeLine}>
          <span>Matched</span>
          <strong>
            {props.matched ?? "—"} / {props.unmatched ?? "—"}
          </strong>
        </div>
      </div>
    </div>
  );
}

export default function OperationsIntelligenceFeed(props: Props) {
  const { slug, serviceDate, surface, frozen = false, title = "Operations Data" } = props;
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

  const hasEntries = useMemo(
    () => sources.some((source) => source.entries.length > 0),
    [sources]
  );

  const sourceByName = useMemo(() => {
    const map = new Map<string, IntelligenceSource>();
    for (const source of sources) map.set(source.source.toUpperCase(), source);
    return map;
  }, [sources]);

  const latestDswRun = runs.find((run) => run.automation_type === "DSW") ?? null;
  const latestFccRun = runs.find((run) => run.automation_type === "FCC") ?? null;
  const latestDswEntry = sourceByName.get("DSW")?.entries?.[0] ?? null;
  const latestFccEntry = sourceByName.get("FCC")?.entries?.[0] ?? null;

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

  const dswRuntime = lastRefresh?.steps?.dsw;
  const fccRuntime = lastRefresh?.steps?.fcc;

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

        {!frozen ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              void loadRuns();
              setOverlayOpen(true);
            }}
            style={{ minHeight: 36, padding: "0 12px", fontSize: 12, width: "100%" }}
          >
            Update Ops
          </button>
        ) : null}
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
          <SourceSummary
            title="DSW"
            updatedAt={latestDswEntry?.timestamp ?? null}
            rows={latestDswRun?.inserted_rows}
            matched={latestDswRun?.matched_rows}
            unmatched={latestDswRun?.unmatched_rows}
          />
          <SourceSummary
            title="FCC"
            updatedAt={latestFccEntry?.timestamp ?? null}
            rows={latestFccRun?.inserted_rows}
            matched={latestFccRun?.matched_rows}
            unmatched={latestFccRun?.unmatched_rows}
          />
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
                <p className="eyebrow" style={{ margin: 0 }}>Runtime</p>
                <h3 className="app-card__title" style={{ fontSize: 16, margin: "2px 0 0" }}>Update Ops</h3>
              </div>

              <div style={twoCol}>
                <RuntimeColumn
                  title="DSW"
                  status={dswRuntime ? (dswRuntime.ok ? "SUCCESS" : "FAILED") : latestDswRun?.status}
                  totalMs={dswRuntime?.duration_ms ?? latestDswRun?.duration_ms}
                  rows={dswRuntime?.result?.ingest?.inserted_row_count ?? latestDswRun?.inserted_rows}
                  matched={dswRuntime?.result?.ingest?.matched_route_count ?? latestDswRun?.matched_rows}
                  unmatched={dswRuntime?.result?.ingest?.unmatched_route_count ?? latestDswRun?.unmatched_rows}
                  steps={[
                    { label: "Login", status: "done" },
                    { label: "Download", ms: latestDswRun?.download_ms, status: "done" },
                    { label: "Import", ms: latestDswRun?.ingest_ms, status: "done" },
                    { label: "Payroll", status: "done" },
                    { label: "Complete", status: dswRuntime?.ok === false ? "failed" : "done" },
                  ]}
                />

                <RuntimeColumn
                  title="FCC"
                  status={fccRuntime ? (fccRuntime.ok ? "SUCCESS" : "FAILED") : latestFccRun?.status}
                  totalMs={fccRuntime?.duration_ms ?? latestFccRun?.duration_ms}
                  rows={fccRuntime?.result?.ingest?.inserted_row_count ?? latestFccRun?.inserted_rows}
                  matched={fccRuntime?.result?.ingest?.matched_route_count ?? latestFccRun?.matched_rows}
                  unmatched={fccRuntime?.result?.ingest?.unmatched_route_count ?? latestFccRun?.unmatched_rows}
                  steps={[
                    { label: "Login", status: "done" },
                    { label: "Navigate", status: "done" },
                    { label: "Search", status: "done" },
                    { label: "Download", ms: latestFccRun?.download_ms, status: "done" },
                    { label: "Import", ms: latestFccRun?.ingest_ms, status: "done" },
                  ]}
                />
              </div>
            </section>

            <section style={sectionBlock}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Ops Updated</p>
                <h3 className="app-card__title" style={{ fontSize: 16, margin: "2px 0 0" }}>Last upload</h3>
              </div>

              <div style={twoCol}>
                <SourceSummary
                  title="DSW"
                  updatedAt={latestDswEntry?.timestamp ?? latestDswRun?.completed_at ?? null}
                  rows={latestDswRun?.inserted_rows}
                  matched={latestDswRun?.matched_rows}
                  unmatched={latestDswRun?.unmatched_rows}
                />
                <SourceSummary
                  title="FCC"
                  updatedAt={latestFccEntry?.timestamp ?? latestFccRun?.completed_at ?? null}
                  rows={latestFccRun?.inserted_rows}
                  matched={latestFccRun?.matched_rows}
                  unmatched={latestFccRun?.unmatched_rows}
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
                        <td style={td}>{run.batch_id ? run.batch_id.slice(0, 8) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {latestDswRun?.status !== "SUCCESS" || latestFccRun?.status !== "SUCCESS" ? (
              runs.find((run) => run.error_message) ? (
                <p style={errorText}>{runs.find((run) => run.error_message)?.error_message}</p>
              ) : null
            ) : null}
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
  padding: 12,
  display: "grid",
  gap: 10,
};

const feedSummaryButton: React.CSSProperties = {
  border: "1px solid #e6edf5",
  background: "#f8fafc",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  cursor: "pointer",
  textAlign: "left",
};

const sourceBox: React.CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
  display: "grid",
  gap: 8,
};

const sourceTitle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 13,
  letterSpacing: "0.06em",
};

const summaryLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#334155",
  fontSize: 12,
  fontWeight: 850,
};

const summaryLabel: React.CSSProperties = {
  color: "#64748b",
  fontWeight: 800,
};

const runtimeLine: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#334155",
  fontSize: 12,
  fontWeight: 850,
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
