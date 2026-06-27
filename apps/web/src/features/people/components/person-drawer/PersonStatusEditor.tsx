"use client";

import { useState } from "react";
import type { RosterEmploymentStatus } from "@/features/people/types/roster.types";
import type { RosterRow } from "@/features/people/types/roster.types";

type Props = {
  person: RosterRow;
  onSave: (draft: {
    employment_status: RosterEmploymentStatus;
    effective_date: string;
    note: string;
  }) => Promise<void>;
};

export default function PersonStatusEditor({
  person,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState(person.employment_status);
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState("");

  async function handleSave() {
    setSaving(true);

    try {
      await onSave({
        employment_status: status,
        effective_date: effectiveDate,
        note,
      });

      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workspace-card" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <p className="workspace-eyebrow">Status</p>
          <h3 className="workspace-card-title">
            Employment Lifecycle
          </h3>
        </div>

        <button
          className="button"
          type="button"
          onClick={() =>
            editing ? setEditing(false) : setEditing(true)
          }
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {!editing ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div><strong>Status:</strong> {person.employment_status}</div>
          <div><strong>Invite:</strong> {person.invite_status}</div>
          <div><strong>Compliance:</strong> {person.compliance_summary}</div>
          <div><strong>Hire Date:</strong> {person.hire_date}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <select
            value={status}
            onChange={(e) =>
              setStatus(
                e.target.value as
                  | "Active"
                  | "Candidate"
                  | "Trainee"
                  | "Former"
              )
            }
          >
            <option value="Candidate">Candidate</option>
            <option value="Trainee">Trainee</option>
            <option value="Active">Active</option>
            <option value="Former">Former</option>
          </select>

          <input
            type="date"
            value={effectiveDate}
            onChange={(e) =>
              setEffectiveDate(e.target.value)
            }
          />

          <textarea
            rows={3}
            placeholder="Reason / note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button
            className="button button-primary"
            type="button"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Status"}
          </button>
        </div>
      )}
    </section>
  );
}
