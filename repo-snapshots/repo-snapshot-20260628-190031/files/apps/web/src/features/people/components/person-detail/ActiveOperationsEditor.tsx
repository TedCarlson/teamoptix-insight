"use client";

import { useState } from "react";
import type { PersonRecord } from "@/features/people/lib/person-detail.types";

export type ActiveOperationsDraft = {
  fx_id: string;
  dswid: string;
  scanner_serial: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay_effective_date: string;
  fuel_card: string;
  pin_id_no: string;
};

function toInputDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildDraft(person: PersonRecord | null): ActiveOperationsDraft {
  return {
    fx_id: person?.fx_id ?? "",
    dswid: person?.dswid ?? "",
    scanner_serial: person?.scanner_serial ?? "",
    dot_expiration_date: toInputDate(person?.dot_expiration_date ?? null),
    qual_cert_expiration_date: toInputDate(
      person?.qual_cert_expiration_date ?? null
    ),
    daily_pay_effective_date: toInputDate(
      person?.daily_pay_effective_date ?? null
    ),
    fuel_card: person?.fuel_card ?? "",
    pin_id_no: person?.pin_id_no ?? "",
  };
}

export default function ActiveOperationsEditor(props: {
  person: PersonRecord | null;
  loading: boolean;
  onSave: (draft: ActiveOperationsDraft) => Promise<void>;
}) {
  const { person, loading, onSave } = props;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ActiveOperationsDraft>(() =>
    buildDraft(person)
  );

  function startEdit() {
    setDraft(buildDraft(person));
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);

    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workspace-card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <p className="workspace-eyebrow">Operations</p>
          <h3 className="workspace-card-title">FedEx workforce fields</h3>
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

      {loading ? (
        <div style={{ paddingTop: 12 }}>Loading...</div>
      ) : !editing ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">FX ID</span>
            <strong>{person?.fx_id ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">DSWID</span>
            <strong>{person?.dswid ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Scanner</span>
            <strong>{person?.scanner_serial ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">DOT Expiration</span>
            <strong>{person?.dot_expiration_date ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Qual Cert</span>
            <strong>{person?.qual_cert_expiration_date ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Daily Pay Effective</span>
            <strong>{person?.daily_pay_effective_date ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Fuel Card</span>
            <strong>{person?.fuel_card ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">ID No / PIN</span>
            <strong>{person?.pin_id_no ?? "—"}</strong>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <input
            value={draft.fx_id}
            placeholder="FX ID"
            onChange={(e) =>
              setDraft((current) => ({ ...current, fx_id: e.target.value }))
            }
          />

          <input
            value={draft.dswid}
            placeholder="DSWID"
            onChange={(e) =>
              setDraft((current) => ({ ...current, dswid: e.target.value }))
            }
          />

          <input
            value={draft.scanner_serial}
            placeholder="Scanner Serial"
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                scanner_serial: e.target.value,
              }))
            }
          />

          <input
            type="date"
            value={draft.dot_expiration_date}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                dot_expiration_date: e.target.value,
              }))
            }
          />

          <input
            type="date"
            value={draft.qual_cert_expiration_date}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                qual_cert_expiration_date: e.target.value,
              }))
            }
          />

          <input
            type="date"
            value={draft.daily_pay_effective_date}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                daily_pay_effective_date: e.target.value,
              }))
            }
          />

          <input
            value={draft.fuel_card}
            placeholder="Fuel Card"
            onChange={(e) =>
              setDraft((current) => ({ ...current, fuel_card: e.target.value }))
            }
          />

          <input
            value={draft.pin_id_no}
            placeholder="ID No / PIN"
            onChange={(e) =>
              setDraft((current) => ({ ...current, pin_id_no: e.target.value }))
            }
          />

          <button
            className="button button-primary"
            type="button"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Operations"}
          </button>
        </div>
      )}
    </section>
  );
}
