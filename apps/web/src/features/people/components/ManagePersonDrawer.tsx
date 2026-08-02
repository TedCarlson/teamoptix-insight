"use client";

import type { RosterEmploymentStatus, RosterRow } from "@/features/people/types/roster.types";
import PersonCoreSection from "@/features/people/components/person-drawer/PersonCoreSection";
import PersonCompensationSection from "@/features/people/components/person-drawer/PersonCompensationSection";
import PersonOperationsSection from "@/features/people/components/person-drawer/PersonOperationsSection";
import PersonLifecycleSection from "@/features/people/components/person-drawer/PersonLifecycleSection";
import PersonTimelineSection from "@/features/people/components/person-drawer/PersonTimelineSection";
import RosterAssignedResourcesSection from "@/features/company/assets/RosterAssignedResourcesSection";

type CoreDraft = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
  notes: string;
  hire_date: string;

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
  employment_status: RosterEmploymentStatus;
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
  companySlug: string;
  person: RosterRow | null;
  savingDetails: boolean;
  savingOperations: boolean;
  savingStatus: boolean;
  inviting?: boolean;
  inviteError?: string | null;
  inviteMessage?: string | null;
  error?: string | null;
  timelineEvents: TimelineEvent[];
  loadingTimeline: boolean;
  onClose: () => void;
  onSaveDetails: (draft: Partial<CoreDraft>) => Promise<boolean>;
  onSaveOperations: (draft: OperationsDraft) => Promise<void>;
  onRefreshPerson: () => Promise<void>;
  onSaveStatus: (draft: StatusDraft) => Promise<void>;
  onSendInvite?: () => Promise<void>;
};

export default function ManagePersonDrawer({
  open,
  companySlug,
  person,
  savingDetails,
  savingOperations,
  savingStatus,
  inviting = false,
  inviteError = null,
  inviteMessage = null,
  error = null,
  timelineEvents,
  loadingTimeline,
  onClose,
  onSaveDetails,
  onSaveOperations,
  onRefreshPerson,
  onSaveStatus,
  onSendInvite,
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
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <aside
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(1180px, 100%)",
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

        {error ? (
          <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>
            {error}
          </p>
        ) : null}

        <PersonLifecycleSection
          person={person}
          saving={savingStatus}
          inviting={inviting}
          inviteError={inviteError}
          inviteMessage={inviteMessage}
          onSave={onSaveStatus}
          onSendInvite={onSendInvite}
        />

        <section className="app-card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p className="workspace-eyebrow">Coaching & documentation</p>
            <strong>Corrective Action Notice</strong>
            <p className="workspace-card-body" style={{ marginBottom: 0 }}>Prepare a company-scoped coaching or disciplinary record for this person.</p>
          </div>
          <a className="button" href={`/company/${companySlug}/people/corrective-actions?rosterId=${person.roster_member_id}`}>Prepare CAN</a>
        </section>

        <PersonCoreSection
          person={person}
          saving={savingDetails}
          onSave={onSaveDetails}
        />

        <PersonCompensationSection companySlug={companySlug} person={person} />

        <PersonOperationsSection
          person={person}
          saving={savingOperations}
          onSave={onSaveOperations}
        />

        <RosterAssignedResourcesSection
          companySlug={companySlug}
          person={person}
          onChanged={onRefreshPerson}
        />

        <PersonTimelineSection events={timelineEvents} loading={loadingTimeline} />
      </aside>
    </div>
  );
}
