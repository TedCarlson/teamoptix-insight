"use client";

import { useState } from "react";
import type { RosterEmploymentStatus, RosterRow } from "@/features/people/types/roster.types";
import PersonCoreSection from "@/features/people/components/person-drawer/PersonCoreSection";
import PersonCompensationSection from "@/features/people/components/person-drawer/PersonCompensationSection";
import PersonOperationsSection from "@/features/people/components/person-drawer/PersonOperationsSection";
import PersonLifecycleSection from "@/features/people/components/person-drawer/PersonLifecycleSection";
import PersonTimelineSection from "@/features/people/components/person-drawer/PersonTimelineSection";
import RosterAssignedResourcesSection from "@/features/company/assets/RosterAssignedResourcesSection";
import styles from "@/features/hiring/components/candidate-drawer/candidate-workflow-drawer.module.css";

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

type WorkspaceTab = "record" | "operations" | "compensation" | "resources" | "timeline" | "actions";

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string; mobileOnly?: boolean }> = [
  { key: "record", label: "Person record" },
  { key: "operations", label: "Operations" },
  { key: "compensation", label: "Compensation" },
  { key: "resources", label: "Resources" },
  { key: "timeline", label: "Timeline" },
  { key: "actions", label: "Actions", mobileOnly: true },
];

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
  onSaveOperations: (draft: OperationsDraft) => Promise<boolean>;
  onRefreshPerson: () => Promise<void>;
  onSaveStatus: (draft: StatusDraft) => Promise<boolean>;
  onSendInvite?: () => Promise<void>;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "P";
}

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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("record");

  if (!open || !person) return null;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-label={`${person.full_name} roster record`}
        aria-modal="true"
        className={styles.drawer}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span aria-hidden="true" className={styles.avatar}>{initials(person.full_name)}</span>
            <div className={styles.identityCopy}>
              <p className="workspace-eyebrow">Roster record</p>
              <h2>{person.full_name}</h2>
              <p>
                {person.worker_type || "Unassigned role"}
                {person.market_code ? ` · Market ${person.market_code}` : ""}
              </p>
            </div>
          </div>

          <div className={styles.headerStatus}>
            <span className={styles.stagePill}>{person.employment_status}</span>
            <span className={styles.headerProgress}>
              <strong>{person.fx_id || "—"}</strong>
              <small>FX ID</small>
            </span>
            <button className="button" onClick={onClose} type="button">Close</button>
          </div>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.workspace}>
          <div className={`${styles.content} ${activeTab === "actions" ? styles.contentWorkflowActive : ""}`}>
            <section
              aria-labelledby="roster-tab-record"
              className={styles.tabPage}
              hidden={activeTab !== "record"}
              id="roster-panel-record"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Person record</p>
                <h3>Identity and contact</h3>
                <p>Maintain the authoritative roster record without leaving the workspace.</p>
              </div>
              <PersonCoreSection person={person} saving={savingDetails} onSave={onSaveDetails} />
            </section>

            <section
              aria-labelledby="roster-tab-operations"
              className={styles.tabPage}
              hidden={activeTab !== "operations"}
              id="roster-panel-operations"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Operations</p>
                <h3>FedEx workforce details</h3>
                <p>Manage identifiers, qualification dates, and the company-owned operating record.</p>
              </div>
              <PersonOperationsSection person={person} saving={savingOperations} onSave={onSaveOperations} />
            </section>

            <section
              aria-labelledby="roster-tab-compensation"
              className={styles.tabPage}
              hidden={activeTab !== "compensation"}
              id="roster-panel-compensation"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Compensation</p>
                <h3>Workforce earnings model</h3>
                <p>Review and edit the compensation structure attached to this roster member.</p>
              </div>
              <PersonCompensationSection companySlug={companySlug} person={person} />
            </section>

            <section
              aria-labelledby="roster-tab-resources"
              className={styles.tabPage}
              hidden={activeTab !== "resources"}
              id="roster-panel-resources"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Resources</p>
                <h3>Assigned company resources</h3>
                <p>Review and manage the assets currently connected to this roster member.</p>
              </div>
              <RosterAssignedResourcesSection
                companySlug={companySlug}
                person={person}
                onChanged={onRefreshPerson}
              />
            </section>

            <section
              aria-labelledby="roster-tab-timeline"
              className={styles.tabPage}
              hidden={activeTab !== "timeline"}
              id="roster-panel-timeline"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Timeline</p>
                <h3>Roster activity</h3>
                <p>Review status changes, record updates, and operational milestones.</p>
              </div>
              <PersonTimelineSection events={timelineEvents} loading={loadingTimeline} />
            </section>
          </div>

          <aside
            aria-label="Roster lifecycle and actions"
            className={`${styles.workflowRail} ${activeTab === "actions" ? styles.workflowRailActive : ""}`}
            id="roster-panel-actions"
          >
            <div className={styles.railSection}>
              <PersonLifecycleSection
                person={person}
                saving={savingStatus}
                inviting={inviting}
                inviteError={inviteError}
                inviteMessage={inviteMessage}
                onSave={onSaveStatus}
                onSendInvite={onSendInvite}
              />
            </div>

            <section className={styles.railSection}>
              <div>
                <p className="workspace-eyebrow">Coaching & documentation</p>
                <h3>Corrective Action Notice</h3>
              </div>
              <p>Prepare a company-scoped coaching or disciplinary record for this person.</p>
              <a className="button" href={`/company/${companySlug}/people/corrective-actions?rosterId=${person.roster_member_id}`}>Prepare CAN</a>
            </section>

            <section className={styles.railSection}>
              <div>
                <p className="workspace-eyebrow">Contact</p>
                <h3>Roster connection</h3>
              </div>
              <div className={styles.contactList}>
                {person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : <span>No phone added</span>}
                {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <span>No email added</span>}
              </div>
              <p>Invite status: <strong>{person.invite_status || "Not invited"}</strong></p>
            </section>
          </aside>
        </div>

        <nav aria-label="Roster workspace pages" className={styles.tabBar} role="tablist">
          {WORKSPACE_TABS.map((tab) => (
            <button
              aria-controls={`roster-panel-${tab.key}`}
              aria-selected={activeTab === tab.key}
              className={`${styles.tabButton} ${tab.mobileOnly ? styles.mobileOnlyTab : ""}`}
              id={`roster-tab-${tab.key}`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
