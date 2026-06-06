"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { DrawerSection, FactRow, compactInput } from "./PersonDrawerRows";

type Draft = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
};

type Props = {
  person: RosterRow;
  saving: boolean;
  onSave: (draft: Draft) => Promise<void>;
};

function buildDraft(person: RosterRow): Draft {
  return {
    full_name: person.full_name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    worker_type: person.worker_type ?? "",
    market_code: person.market_code ?? "",
  };
}

export default function PersonCoreSection({ person, saving, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => buildDraft(person));

  function beginEdit() {
    setDraft(buildDraft(person));
    setEditing(true);
  }

  async function save() {
    await onSave(draft);
    setEditing(false);
  }

  return (
    <DrawerSection
      eyebrow="Details"
      title="Core record"
      editing={editing}
      saving={saving}
      onEdit={() => (editing ? setEditing(false) : beginEdit())}
    >
      {!editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FactRow label="Name" value={person.full_name} />
          <FactRow label="Email" value={person.email} />
          <FactRow label="Phone" value={person.phone} />
          <FactRow label="Role" value={person.worker_type} />
          <FactRow label="Market" value={person.market_code} />
          <FactRow label="Reports to" value={person.reports_to_name} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Name</span>
            <input
              value={draft.full_name}
              onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
              placeholder="Display name"
              style={compactInput}
            />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Email</span>
            <input
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="Email"
              style={compactInput}
            />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Phone</span>
            <input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="Phone"
              style={compactInput}
            />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Role</span>
            <input
              value={draft.worker_type}
              onChange={(e) => setDraft((d) => ({ ...d, worker_type: e.target.value }))}
              placeholder="Worker type"
              style={compactInput}
            />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Market</span>
            <input
              value={draft.market_code}
              onChange={(e) => setDraft((d) => ({ ...d, market_code: e.target.value }))}
              placeholder="Market"
              style={compactInput}
            />
          </label>

          <button
            className="button button-primary"
            type="button"
            disabled={saving || !draft.full_name.trim()}
            onClick={save}
          >
            {saving ? "Saving..." : "Save details"}
          </button>
        </div>
      )}
    </DrawerSection>
  );
}
