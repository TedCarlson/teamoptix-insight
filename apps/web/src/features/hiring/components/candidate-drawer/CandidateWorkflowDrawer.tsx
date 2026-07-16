"use client";

import { useEffect, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import CandidateChecklistPanel from "@/features/hiring/components/candidate-detail/CandidateChecklistPanel";
import PersonCoreSection from "@/features/people/components/person-drawer/PersonCoreSection";
import PersonOperationsSection from "@/features/people/components/person-drawer/PersonOperationsSection";
import PersonLifecycleSection from "@/features/people/components/person-drawer/PersonLifecycleSection";
import PersonTimelineSection from "@/features/people/components/person-drawer/PersonTimelineSection";
import TraineePayOverrideOverlay from "@/features/people/components/TraineePayOverrideOverlay";

type CoreDraft = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
  notes: string;

  date_of_birth: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state_region: string;
  postal_code: string;

  license_number: string;
  issuing_state: string;
  license_issue_date: string;
  license_expiration_date: string;
};

type OperationsDraft = {
  fx_id: string;
  dswid: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay_effective_date: string;
  daily_pay_rate: string;
};

type StatusDraft = {
  employment_status: "Active" | "Candidate" | "Trainee" | "Former";
  effective_date: string;
  note: string;
};

type CandidateStageOption = {
  stage_key: string;
  label: string;
  is_terminal: boolean;
};

type TimelineEvent = {
  id: string;
  event_category: string;
  event_type: string;
  event_detail: string | null;
  event_metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

const DEFAULT_STAGE_OPTIONS: CandidateStageOption[] = [
  { stage_key: "candidate_created", label: "New", is_terminal: false },
  { stage_key: "invited", label: "Invited", is_terminal: false },
  { stage_key: "onboarding", label: "Onboarding", is_terminal: false },
  { stage_key: "ready_for_activation", label: "Ready", is_terminal: false },
  { stage_key: "withdrawn", label: "Withdrawn", is_terminal: true },
  { stage_key: "ineligible", label: "Ineligible", is_terminal: true },
  { stage_key: "dnf", label: "DNF", is_terminal: true },
];

const sectionFrameStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  border: "1px solid #e1e8f2",
  borderRadius: 20,
  background: "#fbfdff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.82)",
};

const candidateFrameStyle: React.CSSProperties = {
  ...sectionFrameStyle,
  borderColor: "#c7d2fe",
  background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
};

const sectionDividerStyle: React.CSSProperties = {
  height: 1,
  background: "#e6edf5",
  margin: "2px 0",
};


type Props = {
  open: boolean;
  slug: string;
  person: RosterRow | null;
  onClose: () => void;
  onSaved?: (person: RosterRow) => void;
  onRefresh?: () => void | Promise<void>;
};

function readinessTone(percent: number) {
  if (percent >= 100) return { label: "Ready", fill: "#16a34a", bg: "#ecfdf3", border: "#bbf7d0", text: "#166534" };
  if (percent >= 80) return { label: "Final", fill: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" };
  if (percent >= 60) return { label: "Clearing", fill: "#ca8a04", bg: "#fefce8", border: "#fde68a", text: "#854d0e" };
  if (percent >= 40) return { label: "Screening", fill: "#f59e0b", bg: "#fffbeb", border: "#fed7aa", text: "#92400e" };
  if (percent >= 20) return { label: "Started", fill: "#dc2626", bg: "#fef2f2", border: "#fecaca", text: "#991b1b" };
  return { label: "Not started", fill: "#94a3b8", bg: "#f8fafc", border: "#dbe4ef", text: "#475569" };
}

function ReadinessSignal(props: {
  progress:
    | {
        required_total: number;
        required_complete: number;
        percent: number;
      }
    | null
    | undefined;
}) {
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
    <section
      style={{
        borderTop: "1px solid #e6edf5",
        paddingTop: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          padding: 14,
          borderRadius: 18,
          border: `1px solid ${tone.border}`,
          background: tone.bg,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.78)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              gap: 7,
              padding: "8px 10px",
              borderRadius: 999,
              border: `1px solid ${tone.border}`,
              background: "#fff",
              boxShadow: "0 12px 28px rgba(15,23,42,.08)",
            }}
          >
            {Array.from({ length: totalBlocks }).map((_, index) => {
              const active = index < filled;

              return (
                <span
                  key={index}
                  style={{
                    width: 28,
                    height: 16,
                    borderRadius: 5,
                    background: active ? tone.fill : "#e8eef6",
                    border: active
                      ? `1px solid ${tone.fill}`
                      : "1px solid #d6dfeb",
                    boxShadow: active
                      ? "0 8px 16px rgba(15,23,42,.14)"
                      : "inset 0 1px 0 rgba(255,255,255,.9)",
                  }}
                />
              );
            })}
          </div>

          <strong
            style={{
              fontSize: 30,
              lineHeight: 1,
              color: tone.text,
              letterSpacing: "-0.04em",
            }}
          >
            {progress.percent}%
          </strong>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 28,
              padding: "4px 10px",
              borderRadius: 999,
              background: "#fff",
              border: `1px solid ${tone.border}`,
              color: tone.text,
              fontSize: 12,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: ".04em",
            }}
          >
            {tone.label}
          </span>

          <strong style={{ color: "#17213a", fontSize: 14 }}>
            {progress.required_complete}/{progress.required_total} required complete
          </strong>
        </div>
      </div>
    </section>
  );
}

export default function CandidateWorkflowDrawer({
  open,
  slug,
  person,
  onClose,
  onSaved,
  onRefresh,
}: Props) {
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingOperations, setSavingOperations] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [stageKey, setStageKey] = useState(person?.candidate_stage_key ?? "candidate_created");
  const [stageNote, setStageNote] = useState("");
  const [showChecklist, setShowChecklist] = useState(false);
  const [showStageNote, setShowStageNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [traineePayPerson, setTraineePayPerson] = useState<RosterRow | null>(null);
  const [traineePayEffectiveDate, setTraineePayEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const selectedRosterId = person?.roster_member_id ?? null;
  const selectedStageKey = person?.candidate_stage_key ?? "candidate_created";

  useEffect(() => {
    if (!open || !selectedRosterId) return;

    setStageKey(selectedStageKey);
    setStageNote("");
    setShowStageNote(false);
    setError(null);
  }, [open, selectedRosterId, selectedStageKey]);

  useEffect(() => {
    const rosterId = person?.roster_member_id;
    if (!open || !rosterId) return;

    let active = true;

    async function loadTimeline() {
      try {
        setLoadingTimeline(true);

        const res = await fetch(
          `/api/company/${slug}/people/roster/${rosterId}/events`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setTimelineEvents([]);
          return;
        }

        setTimelineEvents((data?.events ?? []) as TimelineEvent[]);
      } catch {
        if (active) setTimelineEvents([]);
      } finally {
        if (active) setLoadingTimeline(false);
      }
    }

    void loadTimeline();

    return () => {
      active = false;
    };
  }, [open, person?.roster_member_id, slug]);

  if (!open || !person) return null;

  async function saveCandidateStage() {
    if (!person) return;

    setSavingStage(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/hiring/candidates/${person.roster_member_id}/stage`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            stage_key: stageKey,
            note: stageNote,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to update candidate stage.");
        return;
      }

      const nextStage = DEFAULT_STAGE_OPTIONS.find(
        (stage) => stage.stage_key === stageKey
      );

      onSaved?.({
        ...person,
        candidate_stage_key: data?.stage?.stage_key ?? stageKey,
        candidate_stage_label:
          data?.stage?.stage_label ?? nextStage?.label ?? stageKey,
        candidate_stage_is_terminal:
          data?.stage?.is_terminal ?? nextStage?.is_terminal ?? false,
      });

      await onRefresh?.();
      setStageNote("");
    } catch {
      setError("Failed to update candidate stage.");
    } finally {
      setSavingStage(false);
    }
  }

  async function saveDetails(draft: CoreDraft) {
    if (!person) return;

    setSavingDetails(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${person.roster_member_id}/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save candidate details.");
        return;
      }

      const saved = data?.roster ?? {};

      onSaved?.({
        ...person,
        full_name: saved.full_name ?? draft.full_name,
        email: saved.email ?? draft.email,
        phone: saved.phone ?? draft.phone,
        worker_type: saved.worker_type ?? draft.worker_type,
        market_code: saved.market_code ?? draft.market_code,
        notes: saved.notes ?? draft.notes,
        date_of_birth: saved.date_of_birth ?? draft.date_of_birth,
        address_line_1: saved.address_line_1 ?? draft.address_line_1,
        address_line_2: saved.address_line_2 ?? draft.address_line_2,
        city: saved.city ?? draft.city,
        state_region: saved.state_region ?? draft.state_region,
        postal_code: saved.postal_code ?? draft.postal_code,
        license_number: saved.license_number ?? draft.license_number,
        issuing_state: saved.issuing_state ?? draft.issuing_state,
        license_issue_date: saved.license_issue_date ?? draft.license_issue_date,
        license_expiration_date:
          saved.license_expiration_date ?? draft.license_expiration_date,
      });

      await onRefresh?.();
    } catch {
      setError("Failed to save candidate details.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveOperations(draft: OperationsDraft) {
    if (!person) return;

    setSavingOperations(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${person.roster_member_id}/operations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save candidate operations.");
        return;
      }

      const saved = data?.roster ?? {};

      onSaved?.({
        ...person,
        fx_id: saved.fx_id ?? draft.fx_id,
        dswid: saved.dswid ?? draft.dswid,
        scanner_serial:
          saved.scanner_serial ?? person.scanner_serial,
        dot_expiration_date:
          saved.dot_expiration_date ?? draft.dot_expiration_date,
        qual_cert_expiration_date:
          saved.qual_cert_expiration_date ?? draft.qual_cert_expiration_date,
        daily_pay_effective_date:
          saved.daily_pay_effective_date ?? draft.daily_pay_effective_date,
        daily_pay_rate: saved.daily_pay_rate ?? draft.daily_pay_rate,
        fuel_card: saved.fuel_card ?? person.fuel_card,
        pin_id_no: saved.pin_id_no ?? person.pin_id_no,
      });

      await onRefresh?.();
    } catch {
      setError("Failed to save candidate operations.");
    } finally {
      setSavingOperations(false);
    }
  }

  async function saveStatus(draft: StatusDraft) {
    if (!person) return;

    setSavingStatus(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${person.roster_member_id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to update candidate status.");
        return;
      }

      const nextStatus =
        data?.roster?.employment_status ?? draft.employment_status;

      const updatedPerson = {
        ...person,
        employment_status: nextStatus,
        separation_date: data?.roster?.separation_date ?? person.separation_date,
      };

      onSaved?.(updatedPerson);

      await onRefresh?.();

      if (nextStatus === "Trainee") {
        setTraineePayEffectiveDate(draft.effective_date);
        setTraineePayPerson(updatedPerson);
      }
    } catch {
      setError("Failed to update candidate status.");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(15,23,42,.28)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <aside
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(960px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          background: "#f4f7fb",
          border: "1px solid #d6dfeb",
          borderRadius: 24,
          boxShadow: "0 24px 60px rgba(15,23,42,.18)",
          padding: "14px",
          display: "grid",
          gap: 14,
          alignContent: "start",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            paddingBottom: 8,
          }}
        >
          <div>
            <p className="workspace-eyebrow">Candidate Workflow</p>
            <h2 style={{ margin: 0, fontSize: 20 }}>{person.full_name}</h2>
            <p className="workspace-card-body" style={{ marginTop: 4 }}>
              Candidate · {person.worker_type || "Unassigned"}
            </p>
          </div>

          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {error ? (
          <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>
            {error}
          </p>
        ) : null}

        <section style={candidateFrameStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.95fr)",
              gap: 14,
              alignItems: "start",
            }}
          >
            <section
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <div>
                <p className="workspace-eyebrow">Candidate controls</p>
                <h3 className="workspace-card-title">Hiring disposition</h3>
                <p className="workspace-card-body" style={{ marginTop: 4 }}>
                  Candidate-only workflow items stay here so the person record stays clean below.
                </p>
              </div>

              <section
                style={{
                  borderTop: "1px solid #e6edf5",
                  paddingTop: 14,
                  display: "grid",
                  gap: 10,
                }}
              >
                <p className="workspace-eyebrow">Candidate stage</p>

                <label style={{ display: "grid", gap: 6 }}>
                  <span className="hero-stat__label">Stage</span>
                  <select
                    value={stageKey}
                    onChange={(event) => setStageKey(event.target.value)}
                    style={{
                      minHeight: 42,
                      borderRadius: 12,
                      border: "1px solid #d6dfeb",
                      padding: "0 12px",
                      background: "#fff",
                      color: "#17213a",
                      fontWeight: 800,
                    }}
                  >
                    {DEFAULT_STAGE_OPTIONS.map((stage) => (
                      <option key={stage.stage_key} value={stage.stage_key}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="button"
                  onClick={() => setShowStageNote((v) => !v)}
                >
                  {showStageNote ? "Hide note" : "Add disposition note"}
                </button>

                {showStageNote ? (
                  <label style={{ display: "grid", gap: 6 }}>
                    <span className="hero-stat__label">Note</span>
                    <textarea
                      value={stageNote}
                      onChange={(event) => setStageNote(event.target.value)}
                      placeholder="Add context for this candidate stage change."
                      style={{
                        minHeight: 84,
                        borderRadius: 12,
                        border: "1px solid #d6dfeb",
                        padding: 12,
                        background: "#fff",
                        color: "#17213a",
                      }}
                    />
                  </label>
                ) : null}

                <button
                  type="button"
                  className="button button-primary"
                  disabled={savingStage}
                  onClick={saveCandidateStage}
                >
                  {savingStage ? "Saving..." : "Update candidate stage"}
                </button>
              </section>
            </section>

            <aside>
              <ReadinessSignal progress={person.candidate_progress} />
            </aside>
          </div>
        </section>

        <PersonLifecycleSection
          person={person}
          saving={savingStatus}
          onSave={saveStatus}
        />

        <PersonCoreSection
          person={person}
          saving={savingDetails}
          onSave={saveDetails}
        />

        <PersonOperationsSection
          person={person}
          saving={savingOperations}
          onSave={saveOperations}
        />

        <section style={sectionFrameStyle}>
          <PersonTimelineSection events={timelineEvents} loading={loadingTimeline} />
        </section>
      </aside>

      <TraineePayOverrideOverlay
        open={Boolean(traineePayPerson)}
        slug={slug}
        person={traineePayPerson}
        effectiveDate={traineePayEffectiveDate}
        onClose={() => setTraineePayPerson(null)}
        onSaved={async () => {
          await onRefresh?.();
        }}
      />
    </div>
  );
}
