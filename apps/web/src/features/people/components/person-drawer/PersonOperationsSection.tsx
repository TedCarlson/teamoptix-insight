"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { DrawerSection, FactRow, compactInput } from "./PersonDrawerRows";

type Draft = {
  fx_id: string;
  dswid: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay: boolean;
  scanner_serial: string;
};

type Props = {
  person: RosterRow;
  saving: boolean;
  onSave: (draft: Draft) => Promise<void>;
};

function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildDraft(person: RosterRow): Draft {
  return {
    fx_id: person.fx_id ?? "",
    dswid: person.dswid ?? "",
    dot_expiration_date: toInputDate(person.dot_expiration_date),
    qual_cert_expiration_date: toInputDate(person.qual_cert_expiration_date),
    daily_pay: person.daily_pay ?? false,
    scanner_serial: person.scanner_serial ?? "",
  };
}

export default function PersonOperationsSection({
  person,
  saving,
  onSave,
}: Props) {
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
      eyebrow="Operations"
      title="FedEx workforce fields"
      editing={editing}
      saving={saving}
      onEdit={() => (editing ? setEditing(false) : beginEdit())}
    >
      {!editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FactRow label="FX ID" value={person.fx_id} />
          <FactRow label="DSWID" value={person.dswid} />
          <FactRow label="Scanner" value={person.scanner_serial} />
          <FactRow label="DOT Exp" value={person.dot_expiration_date} />
          <FactRow label="Qual Cert" value={person.qual_cert_expiration_date} />
          <FactRow label="Daily Pay" value={person.daily_pay} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={draft.fx_id}
            onChange={(e) => setDraft((d) => ({ ...d, fx_id: e.target.value }))}
            placeholder="FX ID"
            style={compactInput}
          />
          <input
            value={draft.dswid}
            onChange={(e) => setDraft((d) => ({ ...d, dswid: e.target.value }))}
            placeholder="DSWID"
            style={compactInput}
          />
          <input
            value={draft.scanner_serial}
            onChange={(e) =>
              setDraft((d) => ({ ...d, scanner_serial: e.target.value }))
            }
            placeholder="Scanner serial"
            style={compactInput}
          />
          <input
            type="date"
            value={draft.dot_expiration_date}
            onChange={(e) =>
              setDraft((d) => ({ ...d, dot_expiration_date: e.target.value }))
            }
            style={compactInput}
          />
          <input
            type="date"
            value={draft.qual_cert_expiration_date}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                qual_cert_expiration_date: e.target.value,
              }))
            }
            style={compactInput}
          />
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.daily_pay}
              onChange={(e) =>
                setDraft((d) => ({ ...d, daily_pay: e.target.checked }))
              }
            />
            <span>Daily pay enabled</span>
          </label>

          <button
            className="button button-primary"
            type="button"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving..." : "Save operations"}
          </button>
        </div>
      )}
    </DrawerSection>
  );
}
