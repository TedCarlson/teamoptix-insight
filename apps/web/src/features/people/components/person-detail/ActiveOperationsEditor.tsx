"use client";

import { useState } from "react";
import type { PersonRecord } from "@/features/people/lib/person-detail.types";

type Draft = {
  dswid: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay: boolean;
  scanner_serial: string;
};

function toInputDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildDraft(person: PersonRecord | null): Draft {
  return {
    dswid: person?.dswid ?? "",
    dot_expiration_date: toInputDate(person?.dot_expiration_date ?? null),
    qual_cert_expiration_date: toInputDate(
      person?.qual_cert_expiration_date ?? null
    ),
    daily_pay: person?.daily_pay ?? false,
    scanner_serial: person?.scanner_serial ?? "",
  };
}

export default function ActiveOperationsEditor(props: {
  person: PersonRecord | null;
  loading: boolean;
  onSave: (draft: Draft) => Promise<void>;
}) {
  const { person, loading, onSave } = props;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => buildDraft(person));

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
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
            <span className="hero-stat__label">Daily Pay</span>
            <strong>{person?.daily_pay ? "Yes" : "No"}</strong>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <input
            value={draft.dswid}
            placeholder="DSWID"
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                dswid: e.target.value,
              }))
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

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <input
              type="checkbox"
              checked={draft.daily_pay}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  daily_pay: e.target.checked,
                }))
              }
            />
            <span>Daily Pay Enabled</span>
          </label>

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
