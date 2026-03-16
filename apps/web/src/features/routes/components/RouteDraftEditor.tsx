"use client";

import { useEffect, useState } from "react";

export type RouteDraft = {
  route_name: string;
  current_wa_num: string;
  threshold_stops: string;
  threshold_rate: string;
  route_location: string;
  route_type: string;
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
  rotation_name: string;
  is_active: boolean;
};

type Mode = "create" | "edit";

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  color: "#17213a",
};

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

export default function RouteDraftEditor(props: {
  open: boolean;
  mode: Mode;
  initialDraft: RouteDraft;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: RouteDraft) => Promise<void>;
  onDeactivate?: () => Promise<void>;
}) {
  const { open, mode, initialDraft, busy, onClose, onSave, onDeactivate } = props;

  const [draft, setDraft] = useState<RouteDraft>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  if (!open) return null;

  async function handleSave() {
    await onSave(draft);
  }

  return (
    <article className="value-card" style={{ gridColumn: "1 / -1" }}>
      <p className="value-card__eyebrow">
        {mode === "create" ? "Add route" : "Edit route"}
      </p>
      <h3 className="value-card__title">
        {mode === "create" ? "New baseline route" : "Route baseline draft"}
      </h3>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
        }}
      >
        <input
          value={draft.route_name}
          onChange={(e) =>
            setDraft((current) => ({ ...current, route_name: e.target.value }))
          }
          placeholder="Route"
          style={inputStyle}
        />

        <input
          value={draft.current_wa_num}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              current_wa_num: e.target.value,
            }))
          }
          placeholder="WA#"
          style={inputStyle}
        />

        <input
          value={draft.route_location}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              route_location: e.target.value,
            }))
          }
          placeholder="Location"
          style={inputStyle}
        />

        <select
          value={draft.route_type}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              route_type: e.target.value,
            }))
          }
          style={inputStyle}
        >
          <option value="CORE">Core</option>
          <option value="PEAK">Peak</option>
          <option value="OVERFLOW">Overflow</option>
        </select>

        <input
          value={draft.threshold_stops}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              threshold_stops: e.target.value,
            }))
          }
          placeholder="Threshold"
          style={inputStyle}
        />

        <input
          value={draft.threshold_rate}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              threshold_rate: e.target.value,
            }))
          }
          placeholder="Threshold $"
          style={inputStyle}
        />

        <input
          value={draft.rotation_name}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              rotation_name: e.target.value,
            }))
          }
          placeholder="Rotation"
          style={inputStyle}
        />

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                is_active: e.target.checked,
              }))
            }
          />
          Active
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
          ["S", "runs_s"],
          ["U", "runs_u"],
          ["M", "runs_m"],
          ["T", "runs_t"],
          ["W", "runs_w"],
          ["H", "runs_h"],
          ["F", "runs_f"],
        ].map(([label, key]) => (
          <label key={key} style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={draft[key as keyof RouteDraft] as boolean}
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
          {busy ? "Saving..." : mode === "create" ? "Add Route" : "Save Route"}
        </button>

        {mode === "edit" && onDeactivate ? (
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onDeactivate}
          >
            {busy ? "Working..." : "Deactivate"}
          </button>
        ) : null}

        <button className="button" type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </article>
  );
}