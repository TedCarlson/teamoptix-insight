"use client";

import RosterComplianceIndicators from "@/features/compliance/components/RosterComplianceIndicators";
import type { RosterComplianceSignal } from "@/features/compliance/lib/rosterCompliance";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AddCandidateOverlay from "@/features/hiring/components/AddCandidateOverlay";
import type { AddCandidatePayload } from "@/features/hiring/components/AddCandidateOverlay";
import CandidateWorkflowDrawer from "@/features/hiring/components/candidate-drawer/CandidateWorkflowDrawer";
import FoyerApplicationInbox from "@/features/hiring/components/FoyerApplicationInbox";
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
  profile_id?: string | null;
  person_id?: string | null;
  date_of_birth?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  license_number?: string | null;
  issuing_state?: string | null;
  license_issue_date?: string | null;
  license_expiration_date?: string | null;
  role: string;
  market: string;
  stage_key: string;
  stage_label: string;
  stage_sort_order: number;
  invite_status: string;
  progress?: CandidateProgress | null;
  compliance_signals: RosterComplianceSignal[];
  reports_to_name?: string | null;
  hire_date?: string | null;
  separation_date?: string | null;
  fx_id?: string | null;
  dswid?: string | null;
  dot_expiration_date?: string | null;
  qual_cert_expiration_date?: string | null;
  daily_pay_effective_date?: string | null;
  daily_pay_rate?: string | number | null;
  scanner_serial?: string | null;
  fuel_card?: string | null;
  pin_id_no?: string | null;
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
              background: "#0f172a",
              color: "#ffffff",
              borderColor: "#0f172a",
              fontWeight: 900,
              boxShadow: "0 2px 8px rgba(15,23,42,.15)",
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
  const totalBlocks = Math.max(1, progress.required_total || 1);
  const filled = Math.min(
    totalBlocks,
    Math.max(0, Math.round((progress.percent / 100) * totalBlocks))
  );

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
        {Array.from({ length: totalBlocks }).map((_, index) => {
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
    compliance_signals: row.compliance_signals,
    roster_member_id: row.id,
    profile_id: row.profile_id ?? null,
    person_id: row.person_id ?? null,
    full_name: row.full_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    worker_type: row.role,
    employment_status: "Candidate",
    market_code: row.market,
    reports_to_name: row.reports_to_name ?? "—",
    hire_date: row.hire_date ?? "—",
    invite_status: row.invite_status,
    fx_id: row.fx_id ?? null,
    dswid: row.dswid ?? null,
    dot_expiration_date: row.dot_expiration_date ?? null,
    qual_cert_expiration_date: row.qual_cert_expiration_date ?? null,
    daily_pay_effective_date: row.daily_pay_effective_date ?? null,
    daily_pay_rate: row.daily_pay_rate ?? null,
    separation_date: row.separation_date ?? null,
    scanner_serial: row.scanner_serial ?? null,
    fuel_card: row.fuel_card ?? null,
    pin_id_no: row.pin_id_no ?? null,
    candidate_stage_key: row.stage_key ?? null,
    candidate_stage_label: row.stage_label ?? null,
    candidate_stage_is_terminal: false,
    date_of_birth: row.date_of_birth ?? null,
    address_line_1: row.address_line_1 ?? null,
    address_line_2: row.address_line_2 ?? null,
    city: row.city ?? null,
    state_region: row.state_region ?? null,
    postal_code: row.postal_code ?? null,
    license_number: row.license_number ?? null,
    issuing_state: row.issuing_state ?? null,
    license_issue_date: row.license_issue_date ?? null,
    license_expiration_date: row.license_expiration_date ?? null,
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
  const [candidateOverlaySession, setCandidateOverlaySession] = useState(0);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<RosterRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("onboarding");

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

  async function saveCandidate(payload: AddCandidatePayload) {
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

      if (payload.invite_action === "SEND_INVITE" && data?.roster_id) {
        const inviteRes = await fetch(
          `/api/company/${slug}/people/roster/${data.roster_id}/invite`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        if (!inviteRes.ok) {
          const inviteData = await inviteRes.json().catch(() => ({}));
          setCandidateError(
            inviteData?.error ??
              "Candidate saved, but invite could not be sent."
          );
          await loadCandidates();
          return;
        }
      }

      setSelectedCandidate(null);
      setCandidateOverlayOpen(false);
      setCandidateOverlaySession((session) => session + 1);
      setFilter("onboarding");
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
          ...row.compliance_signals.map(
            (signal) => `${signal.label} ${signal.status}`
          ),
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

  const pursuedRows = rows.filter((row) =>
    ["onboarding", "ready_for_activation"].includes(row.stage_key)
  );
  const readyCount = pursuedRows.filter((row) => (row.progress?.percent ?? 0) === 100).length;
  const avgProgress =
    pursuedRows.length === 0
      ? 0
      : Math.round(
          pursuedRows.reduce((sum, row) => sum + (row.progress?.percent ?? 0), 0) /
            pursuedRows.length
        );

  return (
    <main className="workspace-shell">
      <section
        style={{
          width: "var(--app-page)",
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

        <FoyerApplicationInbox slug={slug} onAdvanced={() => void loadCandidates()} />

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
            {stages
              .filter((stage) => !["candidate_created", "invited"].includes(stage.stage_key))
              .map((stage) => (
                <FilterButton
                  key={stage.stage_key}
                  label={`${stage.label} (${countByStage.get(stage.stage_key) ?? 0})`}
                  active={filter === stage.stage_key}
                  onClick={() => setFilter(stage.stage_key)}
                />
              ))}

            <FilterButton
              label={`All (${rows.length})`}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />

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
                setCandidateOverlaySession((session) => session + 1);
                setCandidateOverlayOpen(true);
              }}
            >
              Add candidate
            </button>
          </div>

          <p className="value-card__body" style={{ marginTop: 12 }}>
            {pursuedRows.length} candidates being pursued · {readyCount} ready · {avgProgress}% average readiness
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
                      <td style={cellStyle}>
                        <RosterComplianceIndicators signals={row.compliance_signals} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <CandidateWorkflowDrawer
          key={selectedCandidate?.roster_member_id ?? "candidate-workflow-drawer"}
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
          key={candidateOverlaySession}
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
