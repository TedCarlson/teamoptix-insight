"use client";

import { useEffect, useState } from "react";

export type SchedulePresetDraft = {
  preset_code: string;
  works_s: boolean;
  works_u: boolean;
  works_m: boolean;
  works_t: boolean;
  works_w: boolean;
  works_h: boolean;
  works_f: boolean;
  uses_rotation: boolean;
};

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  fontSize: 13,
  color: "#17213a",
};

export default function SchedulePresetEditor(props: {
  open: boolean;
  busy: boolean;
  initialDraft: SchedulePresetDraft;
  onClose: () => void;
  mode?: "create" | "edit";
  onSave: (draft: SchedulePresetDraft) => Promise<void>;
}) {
  const { open, busy, initialDraft, onClose, onSave, mode = "create" } = props;
  const [draft, setDraft] = useState<SchedulePresetDraft>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  if (!open) return null;

  async function handleSave() {
    await onSave(draft);
  }

  return (
    <article className="value-card" style={{ gridColumn: "1 / -1" }}>
      <p className="value-card__eyebrow">Schedule presets</p>
      <h3 className="value-card__title">
        {mode === "edit" ? "Edit preset" : "Create preset"}
      </h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Define which production-week days are on. Rotation remains a helper
        layer; the surface shows the result, not the anchor mechanics.
      </p>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(200px, 1fr) minmax(180px, 0.6fr)",
        }}
      >
        <input
          value={draft.preset_code}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              preset_code: e.target.value.toUpperCase(),
            }))
          }
          placeholder="Preset code"
          style={inputStyle}
        />

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draft.uses_rotation}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                uses_rotation: e.target.checked,
              }))
            }
          />
          Uses rotation
        </label>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(7, minmax(90px, 1fr))",
        }}
      >
        {[
          ["S", "works_s"],
          ["U", "works_u"],
          ["M", "works_m"],
          ["T", "works_t"],
          ["W", "works_w"],
          ["H", "works_h"],
          ["F", "works_f"],
        ].map(([label, key]) => (
          <label key={key} style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={draft[key as keyof SchedulePresetDraft] as boolean}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  [key]: e.target.checked,
                }))
              }
            />
            {label}
          </label>
        ))}
      </div>

      <div className="cta-row" style={{ marginTop: 16 }}>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={handleSave}
        >
          {busy ? "Saving..." : mode === "edit" ? "Save changes" : "Save preset"}
        </button>

        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </article>
  );
}