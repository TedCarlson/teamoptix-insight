"use client";

import { useState } from "react";
import type {
  RosterEmploymentStatus,
  RosterRow,
} from "@/features/people/types/roster.types";
import {
  DrawerSection,
  FactRow,
  compactInput,
  compactTextarea,
} from "./PersonDrawerRows";
import RosterComplianceIndicators from "@/features/compliance/components/RosterComplianceIndicators";

type Draft = {
  employment_status: RosterEmploymentStatus;
  effective_date: string;
  note: string;
};

type Props = {
  person: RosterRow;
  saving: boolean;
  inviting?: boolean;
  inviteError?: string | null;
  inviteMessage?: string | null;
  onSave: (draft: Draft) => Promise<boolean>;
  onSendInvite?: () => Promise<void>;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PersonLifecycleSection({
  person,
  saving,
  inviting = false,
  inviteError = null,
  inviteMessage = null,
  onSave,
  onSendInvite,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    employment_status:
      person.employment_status === "Support" ? "Active" : person.employment_status,
    effective_date: todayIso(),
    note: "",
  });

  function beginEdit() {
    setDraft({
      employment_status:
        person.employment_status === "Support" ? "Active" : person.employment_status,
      effective_date: todayIso(),
      note: "",
    });
    setEditing(true);
  }

  async function save() {
    const saved = await onSave(draft);
    if (saved) setEditing(false);
  }

  return (
    <DrawerSection
      eyebrow="Lifecycle"
      title={person.roster_record_kind === "WALK_ON" ? "Support relationship" : "Status and posture"}
      editing={person.roster_record_kind === "WALK_ON" ? false : editing}
      saving={saving}
      onEdit={
        person.roster_record_kind === "WALK_ON"
          ? undefined
          : () => (editing ? setEditing(false) : beginEdit())
      }
    >
      {person.roster_record_kind === "WALK_ON" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FactRow label="Relationship" value="Walk-on support driver" />
          <FactRow label="Employment" value="Not an employee or candidate" />
          <p className="app-card__body" style={{ margin: 0 }}>
            Manage service dates from Dispatch and pay treatment from Payroll.
          </p>
        </div>
      ) : !editing ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <FactRow label="Employment" value={person.employment_status} />
            <FactRow label="Invite" value={person.invite_status} />
            <div id="compliance" style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
              <span className="workspace-card-body">Compliance</span>
              <RosterComplianceIndicators signals={person.compliance_signals} />
            </div>
            <FactRow label="Hire Date" value={person.hire_date} />
            <FactRow label="Separation" value={person.separation_date} />
          </div>

          <div
            style={{
              border: "1px solid #e6edf5",
              borderRadius: 14,
              background: "#fbfdff",
              padding: 10,
              display: "grid",
              gap: 8,
            }}
          >
            <div>
              <strong style={{ fontSize: 13 }}>App access invite</strong>
              <p className="app-card__body" style={{ margin: "3px 0 0" }}>
                Send an invite link to create or connect this person&apos;s app profile.
              </p>
            </div>

            <button
              type="button"
              className="button"
              disabled={!person.email || inviting || !onSendInvite}
              onClick={() => void onSendInvite?.()}
              style={{ justifySelf: "start" }}
            >
              {inviting
                ? "Sending…"
                : String(person.invite_status ?? "").toLowerCase() === "invited"
                  ? "Resend invite"
                  : "Send invite"}
            </button>

            {!person.email ? (
              <p style={{ margin: 0, color: "#c62828", fontSize: 12 }}>
                Add an email before sending an invite.
              </p>
            ) : null}

            {inviteMessage ? (
              <p style={{ margin: 0, color: "#0f9f6e", fontSize: 12 }}>
                {inviteMessage}
              </p>
            ) : null}

            {inviteError ? (
              <p style={{ margin: 0, color: "#c62828", fontSize: 12 }}>
                {inviteError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <select
            value={draft.employment_status}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                employment_status: e.target.value as RosterEmploymentStatus,
              }))
            }
            style={compactInput}
          >
            <option value="Candidate">Candidate</option>
            <option value="Trainee">Trainee</option>
            <option value="Active">Active</option>
            <option value="Former">Former</option>
          </select>

          <input
            type="date"
            value={draft.effective_date}
            onChange={(e) =>
              setDraft((d) => ({ ...d, effective_date: e.target.value }))
            }
            style={compactInput}
          />

          <textarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder="Reason / note"
            style={compactTextarea}
          />

          <button
            className="button button-primary"
            type="button"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save status"}
          </button>
        </div>
      )}
    </DrawerSection>
  );
}
