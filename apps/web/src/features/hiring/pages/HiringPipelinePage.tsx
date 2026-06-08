"use client";

import ComplianceSignal from "@/features/compliance/components/ComplianceSignal";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AddCandidateOverlay from "@/features/hiring/components/AddCandidateOverlay";
import CandidateWorkflowDrawer from "@/features/hiring/components/candidate-drawer/CandidateWorkflowDrawer";
import type { RosterRow } from "@/features/people/types/roster.types";

type PipelineStage = {
  stage_type_id: string;
  stage_key: string;
  label: string;
  is_terminal: boolean;
  sort_order: number;
};

type CandidateProgress = {
  required_total: number;
  required_complete: number;
  percent: number;
};

type PipelineCandidateRow = {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  market: string;
  stage_key: string;
  stage_label: string;
  stage_sort_order: number;
  invite_status: string;
  progress?: CandidateProgress | null;
  compliance: string;
  reports_to_name?: string | null;
  hire_date?: string | null;
  separation_date?: string | null;
  fx_id?: string | null;
  dswid?: string | null;
  dot_expiration_date?: string | null;
  qual_cert_expiration_date?: string | null;
  daily_pay?: boolean | null;
  scanner_serial?: string | null;
};

function FilterButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="button"
      type="button"
      onClick={props.onClick}
      style={
        props.active
          ? {
              borderColor: "#0f172a",
              fontWeight: 800,
            }
          : undefined
      }
    >
      {props.label}
    </button>
  );
}

function readinessTone(percent: number) {
  if (percent >= 100) {
    return {
      label: "Ready",
      fill: "#16a34a",
      bg: "#ecfdf3",
      border: "#bbf7d0",
      text: "#166534",
    };
  }

  if (percent >= 80) {
    return {
      label: "Final",
      fill: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe",
      text: "#1d4ed8",
    };
  }

  if (percent >= 60) {
    return {
      label: "Clearing",
      fill: "#ca8a04",
      bg: "#fefce8",
      border: "#fde68a",
      text: "#854d0e",
    };
  }

  if (percent >= 40) {
    return {
      label: "Screening",
      fill: "#f59e0b",
      bg: "#fffbeb",
      border: "#fed7aa",
      text: "#92400e",
    };
  }

  if (percent >= 20) {
    return {
      label: "Started",
      fill: "#dc2626",
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#991b1b",
    };
  }

  return {
    label: "Not started",
    fill: "#94a3b8",
    bg: "#f8fafc",
    border: "#dbe4ef",
    text: "#475569",
  };
}

function ReadinessBlocks(props: { progress?: CandidateProgress | null }) {
  const progress = props.progress ?? {
    required_total: 0,
    required_complete: 0,
    percent: 0,
  };

  const tone = readinessTone(progress.percent);
  const filled = Math.min(5, Math.max(0, Math.ceil(progress.percent / 20)));

  return (
    <div
      title={`${progress.percent}% · ${progress.required_complete}/${progress.required_total}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        minWidth: 210,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          padding: "5px 7px",
          borderRadius: 999,
          border: `1px solid ${tone.border}`,
          background: tone.bg,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.75)",
        }}
      >
        {[0, 1, 2, 3, 4].map((index) => {
          const active = index < filled;

          return (
            <span
              key={index}
              style={{
                width: 16,
                height: 10,
                borderRadius: 3,
                background: active ? tone.fill : "#e8eef6",
                border: active ? `1px solid ${tone.fill}` : "1px solid #d6dfeb",
                boxShadow: active
                  ? "0 5px 12px rgba(15,23,42,.12)"
                  : "inset 0 1px 0 rgba(255,255,255,.8)",
              }}
            />
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 1 }}>
        <strong
          style={{
            fontSize: 12,
            lineHeight: 1,
            color: tone.text,
            whiteSpace: "nowrap",
          }}
        >
          {progress.percent}% · {progress.required_complete}/{progress.required_total}
        </strong>
        <span
          style={{
            fontSize: 11,
            lineHeight: 1,
            color: "#64748b",
            fontWeight: 800,
            letterSpacing: ".035em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {tone.label}
        </span>
      </div>
    </div>
  );
}

function toRosterRow(row: PipelineCandidateRow): RosterRow {
  return {
    roster_member_id: row.id,
    profile_id: null,
    person_id: null,
    full_name: row.full_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    worker_type: row.role,
    employment_status: "Candidate",
    market_code: row.market,
    reports_to_name: row.reports_to_name ?? "—",
    hire_date: row.hire_date ?? "—",
    invite_status: row.invite_status,
    compliance_summary: row.compliance,
    fx_id: null,
    dswid: null,
    dot_expiration_date: null,
    qual_cert_expiration_date: null,
    daily_pay_effective_date: null,
    separation_date: row.separation_date ?? null,
    scanner_serial: row.scanner_serial ?? null,
    candidate_progress: row.progress ?? null,
  };
}

export default function HiringPipelinePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [rows, setRows] = useState<PipelineCandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidateOverlayOpen, setCandidateOverlayOpen] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<RosterRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const loadCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/hiring/candidates`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load candidate pipeline.");
        setRows([]);
        setStages([]);
        return [];
      }

      const nextStages = (data?.stages ?? []) as PipelineStage[];
      const nextRows = (data?.candidates ?? []) as PipelineCandidateRow[];

      setStages(nextStages);
      setRows(nextRows);

      return nextRows;
    } catch {
      setError("Candidate pipeline request failed.");
      setRows([]);
      setStages([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) void loadCandidates();
  }, [slug, loadCandidates]);

  async function saveCandidate(payload: {
    full_name: string;
    email: string;
    phone: string;
    worker_type: string;
    market_code: string;
    note: string;
  }) {
    try {
      setSavingCandidate(true);
      setCandidateError(null);

      const res = await fetch(`/api/company/${slug}/hiring/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setCandidateError(data?.error ?? "Failed to save candidate.");
        return;
      }

      setCandidateOverlayOpen(false);
      await loadCandidates();
    } catch {
      setCandidateError("Failed to save candidate.");
    } finally {
      setSavingCandidate(false);
    }
  }

  const countByStage = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of rows) {
      map.set(row.stage_key, (map.get(row.stage_key) ?? 0) + 1);
    }

    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows
      .filter((row) => filter === "all" || row.stage_key === filter)
      .filter((row) => {
        if (!q) return true;

        return [
          row.full_name,
          row.role,
          row.market,
          row.stage_label,
          row.invite_status,
          row.compliance,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (a.stage_sort_order !== b.stage_sort_order) {
          return a.stage_sort_order - b.stage_sort_order;
        }

        return a.full_name.localeCompare(b.full_name);
      });
  }, [rows, filter, search]);

  const readyCount = rows.filter((row) => (row.progress?.percent ?? 0) === 100).length;
  const avgProgress =
    rows.length === 0
      ? 0
      : Math.round(
          rows.reduce((sum, row) => sum + (row.progress?.percent ?? 0), 0) /
            rows.length
        );

  return (
    <main className="landing-page">
      <section
        style={{
          width: "min(1440px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "28px 0 32px",
          display: "grid",
          gap: 16,
        }}
      >
        {error ? (
          <article className="value-card" style={{ padding: 14 }}>
            <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>
              {error}
            </p>
          </article>
        ) : null}

        <article className="value-card">
          <p className="value-card__eyebrow">Hiring controls</p>
          <h3 className="value-card__title">Filter the candidate view</h3>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 14,
            }}
          >
            <FilterButton
              label={`All (${rows.length})`}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />

            {stages.map((stage) => (
              <FilterButton
                key={stage.stage_key}
                label={`${stage.label} (${countByStage.get(stage.stage_key) ?? 0})`}
                active={filter === stage.stage_key}
                onClick={() => setFilter(stage.stage_key)}
              />
            ))}

            <input
              type="text"
              placeholder="Search candidate, role, market..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={inputStyle}
            />

            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                setCandidateError(null);
                setCandidateOverlayOpen(true);
              }}
            >
              Add candidate
            </button>
          </div>

          <p className="value-card__body" style={{ marginTop: 12 }}>
            {rows.length} candidates · {readyCount} ready · {avgProgress}% average readiness ·{" "}
            {stages.length} configured stages
          </p>
        </article>

        <article className="value-card" style={{ padding: 18, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <p className="value-card__eyebrow">Pipeline table</p>
              <h3 className="value-card__title">Candidate journeys</h3>
              <p className="value-card__body">
                Click a row to open the candidate workflow drawer.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="value-card__body">Loading candidate pipeline...</p>
          ) : filteredRows.length === 0 ? (
            <p className="value-card__body">No candidate records match the current view.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 980,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Candidate",
                      "Role",
                      "Market",
                      "Stage",
                      "Invite",
                      "Readiness",
                      "Compliance",
                    ].map((label) => (
                      <th
                        key={label}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderBottom: "1px solid #d6dfeb",
                          fontSize: 11,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "#5c6b84",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => setSelectedCandidate(toRosterRow(row))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCandidate(toRosterRow(row));
                        }
                      }}
                      className="operational-table-row"
                      title="Open candidate workflow"
                    >
                      <td style={cellStyle}>
                        <strong>{row.full_name}</strong>
                      </td>
                      <td style={cellStyle}>{row.role}</td>
                      <td style={cellStyle}>{row.market}</td>
                      <td style={cellStyle}>{row.stage_label}</td>
                      <td style={cellStyle}>{row.invite_status}</td>
                      <td style={cellStyle}>
                        <ReadinessBlocks progress={row.progress} />
                      </td>
                      <td style={cellStyle}><ComplianceSignal value={row.compliance} compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <CandidateWorkflowDrawer
          open={Boolean(selectedCandidate)}
          slug={slug}
          person={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onSaved={(updated) => {
            setSelectedCandidate(updated);
            void loadCandidates();
          }}
          onRefresh={async () => {
            const nextRows = await loadCandidates();
            if (!selectedCandidate) return;

            const match = nextRows.find(
              (row) => row.id === selectedCandidate.roster_member_id
            );

            if (match) {
              setSelectedCandidate(toRosterRow(match));
            }
          }}
        />

        <AddCandidateOverlay
          open={candidateOverlayOpen}
          saving={savingCandidate}
          error={candidateError}
          onClose={() => setCandidateOverlayOpen(false)}
          onSubmit={saveCandidate}
        />
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  height: 44,
  minWidth: 320,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

const cellStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  fontSize: 14,
};
