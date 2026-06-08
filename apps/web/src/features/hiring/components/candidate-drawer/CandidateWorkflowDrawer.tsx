"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import CandidateChecklistPanel from "@/features/hiring/components/candidate-detail/CandidateChecklistPanel";
import PersonCoreSection from "@/features/people/components/person-drawer/PersonCoreSection";
import PersonOperationsSection from "@/features/people/components/person-drawer/PersonOperationsSection";
import PersonLifecycleSection from "@/features/people/components/person-drawer/PersonLifecycleSection";

type CoreDraft = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
};

type OperationsDraft = {
  fx_id: string;
  dswid: string;
  scanner_serial: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay_effective_date: string;
  fuel_card: string;
  pin_id_no: string;
};

type StatusDraft = {
  employment_status: "Active" | "Candidate" | "Former";
  effective_date: string;
  note: string;
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
  const filled = Math.min(5, Math.max(0, Math.ceil(progress.percent / 20)));

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
            {[0, 1, 2, 3, 4].map((index) => {
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
  const [error, setError] = useState<string | null>(null);

  if (!open || !person) return null;

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

      onSaved?.({
        ...person,
        full_name: draft.full_name,
        email: draft.email,
        phone: draft.phone,
        worker_type: draft.worker_type,
        market_code: draft.market_code,
      });
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

      onSaved?.({
        ...person,
        fx_id: draft.fx_id,
        dswid: draft.dswid,
        dot_expiration_date: draft.dot_expiration_date,
        qual_cert_expiration_date: draft.qual_cert_expiration_date,
        daily_pay_effective_date: draft.daily_pay_effective_date,
        scanner_serial: draft.scanner_serial,
        fuel_card: draft.fuel_card,
        pin_id_no: draft.pin_id_no,
      });
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

      onSaved?.({
        ...person,
        employment_status:
          data?.roster?.employment_status ?? draft.employment_status,
        separation_date: data?.roster?.separation_date ?? person.separation_date,
      });
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
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          height: "100%",
          overflow: "auto",
          background: "#fff",
          borderLeft: "1px solid #d6dfeb",
          boxShadow: "-24px 0 60px rgba(15,23,42,.18)",
          padding: "12px 14px 18px",
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

        <ReadinessSignal progress={person.candidate_progress} />

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

        <PersonLifecycleSection
          person={person}
          saving={savingStatus}
          onSave={saveStatus}
        />

        <CandidateChecklistPanel
          slug={slug}
          rosterId={person.roster_member_id}
          onChanged={onRefresh}
        />

        <section
          style={{
            borderTop: "1px solid #e6edf5",
            paddingTop: 14,
            display: "grid",
            gap: 6,
          }}
        >
          <p className="workspace-eyebrow">Timeline</p>
          <h3 className="workspace-card-title">Candidate journey</h3>
          <p className="workspace-card-body">
            Candidate timeline wiring will consume roster events next.
          </p>
        </section>
      </aside>
    </div>
  );
}
