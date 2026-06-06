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

type Draft = {
  employment_status: RosterEmploymentStatus;
  effective_date: string;
  note: string;
};

type Props = {
  person: RosterRow;
  saving: boolean;
  onSave: (draft: Draft) => Promise<void>;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PersonLifecycleSection({
  person,
  saving,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    employment_status: person.employment_status,
    effective_date: todayIso(),
    note: "",
  });

  function beginEdit() {
    setDraft({
      employment_status: person.employment_status,
      effective_date: todayIso(),
      note: "",
    });
    setEditing(true);
  }

  async function save() {
    await onSave(draft);
    setEditing(false);
  }

  return (
    <DrawerSection
      eyebrow="Lifecycle"
      title="Status and posture"
      editing={editing}
      saving={saving}
      onEdit={() => (editing ? setEditing(false) : beginEdit())}
    >
      {!editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FactRow label="Employment" value={person.employment_status} />
          <FactRow label="Invite" value={person.invite_status} />
          <FactRow label="Compliance" value={person.compliance_summary} />
          <FactRow label="Hire Date" value={person.hire_date} />
          <FactRow label="Separation" value={person.separation_date} />
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
