"use client";

import type { RosterRow } from "@/features/people/types/roster.types";
import PersonCoreSection from "@/features/people/components/person-drawer/PersonCoreSection";
import PersonOperationsSection from "@/features/people/components/person-drawer/PersonOperationsSection";
import PersonLifecycleSection from "@/features/people/components/person-drawer/PersonLifecycleSection";
import PersonTimelineSection from "@/features/people/components/person-drawer/PersonTimelineSection";

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
  daily_pay_rate: string;
  fuel_card: string;
  pin_id_no: string;
};

type StatusDraft = {
  employment_status: "Active" | "Candidate" | "Former";
  effective_date: string;
  note: string;
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

type Props = {
  open: boolean;
  person: RosterRow | null;
  savingDetails: boolean;
  savingOperations: boolean;
  savingStatus: boolean;
  timelineEvents: TimelineEvent[];
  loadingTimeline: boolean;
  onClose: () => void;
  onSaveDetails: (draft: CoreDraft) => Promise<void>;
  onSaveOperations: (draft: OperationsDraft) => Promise<void>;
  onSaveStatus: (draft: StatusDraft) => Promise<void>;
};

export default function ManagePersonDrawer({
  open,
  person,
  savingDetails,
  savingOperations,
  savingStatus,
  timelineEvents,
  loadingTimeline,
  onClose,
  onSaveDetails,
  onSaveOperations,
  onSaveStatus,
}: Props) {
  if (!open || !person) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15,23,42,.28)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(760px,100%)",
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
            <p className="workspace-eyebrow">Person Record</p>
            <h2 style={{ margin: 0, fontSize: 20 }}>{person.full_name}</h2>
            <p className="workspace-card-body" style={{ marginTop: 4 }}>
              {person.employment_status} · {person.worker_type || "Unassigned"}
            </p>
          </div>

          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <PersonCoreSection
          person={person}
          saving={savingDetails}
          onSave={onSaveDetails}
        />

        <PersonOperationsSection
          person={person}
          saving={savingOperations}
          onSave={onSaveOperations}
        />

        <PersonLifecycleSection
          person={person}
          saving={savingStatus}
          onSave={onSaveStatus}
        />

        <PersonTimelineSection events={timelineEvents} loading={loadingTimeline} />
      </aside>
    </div>
  );
}
