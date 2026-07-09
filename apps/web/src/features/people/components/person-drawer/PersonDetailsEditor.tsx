"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";

type Draft = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
  hire_date: string;
};

type Props = {
  person: RosterRow;
  saving: boolean;
  onSave: (draft: Draft) => Promise<void>;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  font: "inherit",
};

function ViewRow(props: { label: string; value: string | boolean | null | undefined }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "128px 1fr", gap: 10 }}>
      <span className="hero-stat__label">{props.label}</span>
      <strong>{props.value === true ? "Yes" : props.value === false ? "No" : props.value || "—"}</strong>
    </div>
  );
}

function getDraft(person: RosterRow): Draft {
  return {
    full_name: person.full_name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    worker_type: person.worker_type ?? "",
    market_code: person.market_code ?? "",
    hire_date: person.hire_date ?? "",
  };
}

export default function PersonDetailsEditor({ person, saving, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => getDraft(person));

  function startEdit() {
    setDraft(getDraft(person));
    setEditing(true);
  }

  return (
    <section className="workspace-card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <p className="workspace-eyebrow">Details</p>
          <h3 className="workspace-card-title">Core record</h3>
        </div>
        <button
          className="button"
          type="button"
          disabled={saving}
          onClick={() => (editing ? setEditing(false) : startEdit())}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {!editing ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <ViewRow label="Name" value={person.full_name} />
          <ViewRow label="Email" value={person.email} />
          <ViewRow label="Phone" value={person.phone} />
          <ViewRow label="Role" value={person.worker_type} />
          <ViewRow label="Market" value={person.market_code} />
          <ViewRow label="Hire Date" value={person.hire_date} />
          <ViewRow label="Reports to" value={person.reports_to_name} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {(["full_name", "email", "phone", "worker_type", "market_code", "hire_date"] as const).map((key) => (
            <input
              key={key}
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              placeholder={key.replace("_", " ")}
              style={inputStyle}
            />
          ))}

          <button
            className="button button-primary"
            type="button"
            disabled={saving || !draft.full_name.trim()}
            onClick={() => onSave(draft)}
          >
            {saving ? "Saving..." : "Save details"}
          </button>
        </div>
      )}
    </section>
  );
}
