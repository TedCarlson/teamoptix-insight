"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RosterRow } from "@/features/people/types/roster.types";
import CandidateChecklistPanel from "@/features/hiring/components/candidate-detail/CandidateChecklistPanel";
import type { CandidateChecklistProgress } from "@/features/hiring/components/candidate-detail/CandidateChecklistPanel";
import PersonCoreSection from "@/features/people/components/person-drawer/PersonCoreSection";
import PersonCompensationSection from "@/features/people/components/person-drawer/PersonCompensationSection";
import PersonOperationsSection from "@/features/people/components/person-drawer/PersonOperationsSection";
import PersonLifecycleSection from "@/features/people/components/person-drawer/PersonLifecycleSection";
import PersonTimelineSection from "@/features/people/components/person-drawer/PersonTimelineSection";
import TraineePayOverrideOverlay from "@/features/people/components/TraineePayOverrideOverlay";
import CandidatePromotionOverlay from "./CandidatePromotionOverlay";
import styles from "./candidate-workflow-drawer.module.css";

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

type WorkspaceTab =
  | "readiness"
  | "record"
  | "operations"
  | "compensation"
  | "timeline"
  | "workflow";

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string; mobileOnly?: boolean }> = [
  { key: "readiness", label: "Readiness" },
  { key: "record", label: "Candidate record" },
  { key: "operations", label: "Operations" },
  { key: "compensation", label: "Compensation" },
  { key: "timeline", label: "Timeline" },
  { key: "workflow", label: "Workflow", mobileOnly: true },
];

const DEFAULT_STAGE_OPTIONS: CandidateStageOption[] = [
  { stage_key: "candidate_created", label: "New", is_terminal: false },
  { stage_key: "invited", label: "Invited", is_terminal: false },
  { stage_key: "onboarding", label: "Onboarding", is_terminal: false },
  { stage_key: "ready_for_activation", label: "Ready", is_terminal: false },
  { stage_key: "withdrawn", label: "Withdrawn", is_terminal: true },
  { stage_key: "ineligible", label: "Ineligible", is_terminal: true },
  { stage_key: "dnf", label: "DNF", is_terminal: true },
];

const EDITABLE_STAGE_OPTIONS = DEFAULT_STAGE_OPTIONS.filter(
  (stage) => !["candidate_created", "invited"].includes(stage.stage_key)
);

const EMPTY_PROGRESS: CandidateChecklistProgress = {
  required_total: 0,
  required_complete: 0,
  percent: 0,
};

function editableStageKey(value?: string | null) {
  return EDITABLE_STAGE_OPTIONS.some((stage) => stage.stage_key === value)
    ? String(value)
    : "onboarding";
}

type Props = {
  open: boolean;
  slug: string;
  person: RosterRow | null;
  onClose: () => void;
  onSaved?: (person: RosterRow) => void;
  onRefresh?: () => void | Promise<void>;
};

export default function CandidateWorkflowDrawer({
  open,
  slug,
  person,
  onClose,
  onSaved,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingOperations, setSavingOperations] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("readiness");
  const [progress, setProgress] = useState<CandidateChecklistProgress>(
    person?.candidate_progress ?? EMPTY_PROGRESS
  );
  const [stageKey, setStageKey] = useState(editableStageKey(person?.candidate_stage_key));
  const [stageNote, setStageNote] = useState("");
  const [showStageNote, setShowStageNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [traineePayPerson, setTraineePayPerson] = useState<RosterRow | null>(null);
  const [traineePayEffectiveDate, setTraineePayEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [promotionOpen, setPromotionOpen] = useState(false);

  const selectedRosterId = person?.roster_member_id ?? null;
  const selectedStageKey = editableStageKey(person?.candidate_stage_key);
  const sourceProgress = person?.candidate_progress;
  const sourceRequiredTotal = sourceProgress?.required_total ?? 0;
  const sourceRequiredComplete = sourceProgress?.required_complete ?? 0;
  const sourcePercent = sourceProgress?.percent ?? 0;

  useEffect(() => {
    if (!open || !selectedRosterId) return;

    setProgress({
      required_total: sourceRequiredTotal,
      required_complete: sourceRequiredComplete,
      percent: sourcePercent,
    });
  }, [
    open,
    selectedRosterId,
    sourceRequiredTotal,
    sourceRequiredComplete,
    sourcePercent,
  ]);

  useEffect(() => {
    if (!open || !selectedRosterId) return;

    setStageKey(selectedStageKey);
    setStageNote("");
    setShowStageNote(false);
    setInviteMessage(null);
    setActiveTab("readiness");
    setPromotionOpen(false);
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

  async function sendInvite() {
    if (!person?.email) {
      setError("Add an email address before sending an app invite.");
      return;
    }

    setInviting(true);
    setInviteMessage(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${person.roster_member_id}/invite`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Failed to send the candidate app invite.");
        return;
      }

      setInviteMessage("App invite sent.");
      onSaved?.({ ...person, invite_status: "Invited" });
      await onRefresh?.();
    } catch {
      setError("Failed to send the candidate app invite.");
    } finally {
      setInviting(false);
    }
  }

  async function saveDetails(draft: Partial<CoreDraft>) {
    if (!person) return false;

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
        setError(
          data?.detail ?? data?.error ?? "Failed to save candidate details.",
        );
        return false;
      }

      const saved = data?.roster ?? {};

      onSaved?.({
        ...person,
        full_name: saved.full_name ?? draft.full_name ?? person.full_name,
        email: saved.email ?? draft.email ?? person.email,
        phone: saved.phone ?? draft.phone ?? person.phone,
        worker_type:
          saved.worker_type ?? draft.worker_type ?? person.worker_type,
        market_code:
          saved.market_code ?? draft.market_code ?? person.market_code,
        notes: saved.notes ?? draft.notes ?? person.notes,
        hire_date: saved.hire_date ?? draft.hire_date ?? person.hire_date,
        date_of_birth:
          saved.date_of_birth ?? draft.date_of_birth ?? person.date_of_birth,
        address_line_1:
          saved.address_line_1 ?? draft.address_line_1 ?? person.address_line_1,
        address_line_2:
          saved.address_line_2 ?? draft.address_line_2 ?? person.address_line_2,
        city: saved.city ?? draft.city ?? person.city,
        state_region:
          saved.state_region ?? draft.state_region ?? person.state_region,
        postal_code:
          saved.postal_code ?? draft.postal_code ?? person.postal_code,
        license_number:
          saved.license_number ?? draft.license_number ?? person.license_number,
        issuing_state:
          saved.issuing_state ?? draft.issuing_state ?? person.issuing_state,
        license_issue_date:
          saved.license_issue_date ??
          draft.license_issue_date ??
          person.license_issue_date,
        license_expiration_date:
          saved.license_expiration_date ??
          draft.license_expiration_date ??
          person.license_expiration_date,
      });

      await onRefresh?.();
      return true;
    } catch {
      setError("Failed to save candidate details.");
      return false;
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveOperations(draft: OperationsDraft) {
    if (!person) return false;

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
        setError(data?.detail ?? data?.error ?? "Failed to save candidate operations.");
        return false;
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
      return true;
    } catch {
      setError("Failed to save candidate operations.");
      return false;
    } finally {
      setSavingOperations(false);
    }
  }

  async function saveStatus(draft: StatusDraft) {
    if (!person) return false;

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
        setError(data?.detail ?? data?.error ?? "Failed to update candidate status.");
        return false;
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
      return true;
    } catch {
      setError("Failed to update candidate status.");
      return false;
    } finally {
      setSavingStatus(false);
    }
  }

  const stageLabel =
    person.candidate_stage_label ||
    EDITABLE_STAGE_OPTIONS.find((stage) => stage.stage_key === selectedStageKey)?.label ||
    "Onboarding";

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={styles.backdrop}
    >
      <aside
        aria-label={`${person.full_name} candidate workflow`}
        aria-modal="true"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        className={styles.drawer}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {person.full_name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "C"}
            </span>
            <div className={styles.identityCopy}>
              <p className="workspace-eyebrow">Candidate workflow</p>
              <h2>{person.full_name}</h2>
              <p>
                {person.worker_type || "Unassigned role"}
                {person.market_code ? ` · Market ${person.market_code}` : ""}
              </p>
            </div>
          </div>

          <div className={styles.headerStatus}>
            <span className={styles.stagePill}>{stageLabel}</span>
            <span className={styles.headerProgress}>
              <strong>{progress.required_complete}/{progress.required_total}</strong>
              <small>{progress.percent}% ready</small>
            </span>
            <button className="button" type="button" onClick={onClose}>Close</button>
          </div>
        </header>

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : null}

        <div className={styles.workspace}>
          <div
            className={`${styles.content} ${activeTab === "workflow" ? styles.contentWorkflowActive : ""}`}
          >
            <section
              aria-labelledby="candidate-tab-readiness"
              className={styles.tabPage}
              hidden={activeTab !== "readiness"}
              id="candidate-panel-readiness"
              role="tabpanel"
            >
              <CandidateChecklistPanel
                slug={slug}
                rosterId={person.roster_member_id}
                onChanged={onRefresh}
                onProgressChange={setProgress}
                embedded
              />
            </section>

            <section
              aria-labelledby="candidate-tab-record"
              className={styles.tabPage}
              hidden={activeTab !== "record"}
              id="candidate-panel-record"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Candidate record</p>
                <h3>Identity, contact, and lifecycle</h3>
                <p>Maintain the authoritative candidate record without leaving the workflow.</p>
              </div>
              <PersonLifecycleSection
                person={person}
                saving={savingStatus}
                onSave={saveStatus}
                inviting={inviting}
                inviteError={error}
                inviteMessage={inviteMessage}
                onSendInvite={sendInvite}
              />
              <PersonCoreSection
                person={person}
                saving={savingDetails}
                onSave={saveDetails}
              />
            </section>

            <section
              aria-labelledby="candidate-tab-operations"
              className={styles.tabPage}
              hidden={activeTab !== "operations"}
              id="candidate-panel-operations"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Operations</p>
                <h3>Driver operating details</h3>
                <p>Manage identifiers, qualifications, and the company-owned operating record.</p>
              </div>
              <PersonOperationsSection
                person={person}
                saving={savingOperations}
                onSave={saveOperations}
              />
            </section>

            <section
              aria-labelledby="candidate-tab-compensation"
              className={styles.tabPage}
              hidden={activeTab !== "compensation"}
              id="candidate-panel-compensation"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Compensation</p>
                <h3>Candidate earnings model</h3>
                <p>Review and edit the compensation assumptions attached to this candidate.</p>
              </div>
              <PersonCompensationSection companySlug={slug} person={person} />
            </section>

            <section
              aria-labelledby="candidate-tab-timeline"
              className={styles.tabPage}
              hidden={activeTab !== "timeline"}
              id="candidate-panel-timeline"
              role="tabpanel"
            >
              <div className={styles.tabIntro}>
                <p className="workspace-eyebrow">Timeline</p>
                <h3>Candidate activity</h3>
                <p>Review hiring decisions, record changes, and candidate milestones.</p>
              </div>
              <PersonTimelineSection events={timelineEvents} loading={loadingTimeline} />
            </section>
          </div>

          <aside
            className={`${styles.workflowRail} ${activeTab === "workflow" ? styles.workflowRailActive : ""}`}
            aria-label="Candidate workflow controls"
            id="candidate-panel-workflow"
          >
            <section className={`${styles.railSection} ${styles.promotionSection}`}>
              <div>
                <p className="workspace-eyebrow">Roster promotion</p>
                <h3>Put this person to work</h3>
              </div>
              <p>
                Promote directly to Trainee or Active. Incomplete readiness remains visible but never blocks the move.
              </p>
              <button
                className={`button ${styles.promoteButton}`}
                onClick={() => setPromotionOpen(true)}
                type="button"
              >
                Promote
              </button>
            </section>

            <section className={styles.railSection}>
              <div>
                <p className="workspace-eyebrow">Workflow</p>
                <h3>Hiring disposition</h3>
              </div>

              <div className={styles.railProgress}>
                <span><strong>{progress.required_complete}/{progress.required_total}</strong> milestones</span>
                <span>{progress.percent}%</span>
              </div>
              <progress max={100} value={progress.percent} aria-label={`${progress.percent}% ready`} />

              <label className={styles.field}>
                <span>Candidate stage</span>
                <select value={stageKey} onChange={(event) => setStageKey(event.target.value)}>
                  {EDITABLE_STAGE_OPTIONS.map((stage) => (
                    <option key={stage.stage_key} value={stage.stage_key}>{stage.label}</option>
                  ))}
                </select>
              </label>

              <button
                className="button"
                type="button"
                onClick={() => setShowStageNote((value) => !value)}
              >
                {showStageNote ? "Hide disposition note" : "Add disposition note"}
              </button>

              {showStageNote ? (
                <label className={styles.field}>
                  <span>Disposition note</span>
                  <textarea
                    value={stageNote}
                    onChange={(event) => setStageNote(event.target.value)}
                    placeholder="Context for this stage change"
                  />
                </label>
              ) : null}

              <button
                className="button button-primary"
                type="button"
                disabled={savingStage}
                onClick={saveCandidateStage}
              >
                {savingStage ? "Saving…" : "Save stage"}
              </button>
            </section>

            <section className={styles.railSection}>
              <div>
                <p className="workspace-eyebrow">Interview</p>
                <h3>Candidate conversation</h3>
              </div>
              <p>Schedule or review this candidate from the shared interview agenda.</p>
              <Link className="button" href={`/company/${slug}/people/interviews`}>
                Open interview agenda
              </Link>
            </section>

            <section className={styles.railSection}>
              <div>
                <p className="workspace-eyebrow">Contact</p>
                <h3>Candidate connection</h3>
              </div>
              <div className={styles.contactList}>
                {person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : <span>No phone added</span>}
                {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <span>No email added</span>}
              </div>
              <p>Invite status: <strong>{person.invite_status || "Not invited"}</strong></p>
              <button
                className="button"
                type="button"
                disabled={!person.email || inviting}
                onClick={() => void sendInvite()}
              >
                {inviting ? "Sending…" : person.invite_status === "Invited" ? "Resend app invite" : "Send app invite"}
              </button>
              {inviteMessage ? <p className={styles.success}>{inviteMessage}</p> : null}
            </section>
          </aside>
        </div>

        <nav className={styles.tabBar} aria-label="Candidate workspace pages" role="tablist">
          {WORKSPACE_TABS.map((tab) => (
            <button
              aria-controls={`candidate-panel-${tab.key}`}
              aria-selected={activeTab === tab.key}
              className={`${styles.tabButton} ${tab.mobileOnly ? styles.mobileOnlyTab : ""}`}
              id={`candidate-tab-${tab.key}`}
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
      <CandidatePromotionOverlay
        open={promotionOpen}
        slug={slug}
        person={person}
        onClose={() => setPromotionOpen(false)}
        onPromoted={async (roster) => {
          onSaved?.(roster);
          await onRefresh?.();
          setPromotionOpen(false);
          onClose();
          router.push(`/company/${slug}/schedule/generated`);
        }}
      />
    </div>
  );
}
