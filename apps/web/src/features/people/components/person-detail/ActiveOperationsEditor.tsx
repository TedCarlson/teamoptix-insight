"use client";

import { useEffect, useState } from "react";
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

export default function ActiveOperationsEditor(props: {
  person: PersonRecord | null;
  loading: boolean;
  onSave: (draft: Draft) => Promise<void>;
}) {
  const { person, loading, onSave } = props;

  const [draft, setDraft] = useState<Draft>({
    dswid: "",
    dot_expiration_date: "",
    qual_cert_expiration_date: "",
    daily_pay: false,
    scanner_serial: "",
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      dswid: person?.dswid ?? "",
      dot_expiration_date: toInputDate(person?.dot_expiration_date ?? null),
      qual_cert_expiration_date: toInputDate(
        person?.qual_cert_expiration_date ?? null
      ),
      daily_pay: person?.daily_pay ?? false,
      scanner_serial: person?.scanner_serial ?? "",
    });
  }, [person]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Edit operations</p>
      <h3 className="value-card__title">FedEx workforce fields</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Manage DSWID, scanner serial, compliance dates, and daily pay.
      </p>

      {loading ? (
        <div style={{ paddingTop: 16 }}>Loading editor...</div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span className="value-card__eyebrow">DSWID</span>
              <input
                value={draft.dswid}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, dswid: e.target.value }))
                }
                className="button"
                style={{ textAlign: "left", background: "#fff" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span className="value-card__eyebrow">Scanner serial</span>
              <input
                value={draft.scanner_serial}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    scanner_serial: e.target.value,
                  }))
                }
                className="button"
                style={{ textAlign: "left", background: "#fff" }}
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span className="value-card__eyebrow">DOT expiration</span>
              <input
                type="date"
                value={draft.dot_expiration_date}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    dot_expiration_date: e.target.value,
                  }))
                }
                className="button"
                style={{ textAlign: "left", background: "#fff" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span className="value-card__eyebrow">Qual cert expiration</span>
              <input
                type="date"
                value={draft.qual_cert_expiration_date}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    qual_cert_expiration_date: e.target.value,
                  }))
                }
                className="button"
                style={{ textAlign: "left", background: "#fff" }}
              />
            </label>
          </div>

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
            <span>Daily pay enabled</span>
          </label>

          <div className="cta-row">
            <button
              className="button button-primary"
              type="button"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}