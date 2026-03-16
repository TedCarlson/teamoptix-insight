"use client";

import { useEffect, useMemo, useState } from "react";

type PresetOption = {
  id: string;
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

export type ScheduleBaselineDraft = {
  preset_id: string;
  rotation_mode: string;
  default_route_s: string;
  default_route_u: string;
  default_route_m: string;
  default_route_t: string;
  default_route_w: string;
  default_route_h: string;
  default_route_f: string;
};

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

const checkboxLikeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  height: 24,
  padding: "0 6px",
  borderRadius: 999,
  border: "1px solid #d6dfeb",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1,
};

const activeDayStyle: React.CSSProperties = {
  ...checkboxLikeStyle,
  border: "1px solid #7bc48a",
  background: "#e8f6eb",
  color: "#2f8f46",
};

export default function ScheduleBaselineEditor(props: {
  open: boolean;
  busy: boolean;
  driverName: string;
  presetOptions: PresetOption[];
  initialDraft: ScheduleBaselineDraft;
  onClose: () => void;
  onSave: (draft: ScheduleBaselineDraft) => Promise<void>;
}) {
  const { open, busy, driverName, presetOptions, initialDraft, onClose, onSave } =
    props;

  const [draft, setDraft] = useState<ScheduleBaselineDraft>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const selectedPreset = useMemo(
    () => presetOptions.find((preset) => preset.id === draft.preset_id) ?? null,
    [presetOptions, draft.preset_id]
  );

  if (!open) return null;

  async function handleSave() {
    await onSave(draft);
  }

  function dayEnabled(
    day: keyof Pick<
      ScheduleBaselineDraft,
      | "default_route_s"
      | "default_route_u"
      | "default_route_m"
      | "default_route_t"
      | "default_route_w"
      | "default_route_h"
      | "default_route_f"
    >
  ) {
    if (!selectedPreset) return false;

    const map = {
      default_route_s: selectedPreset.works_s,
      default_route_u: selectedPreset.works_u,
      default_route_m: selectedPreset.works_m,
      default_route_t: selectedPreset.works_t,
      default_route_w: selectedPreset.works_w,
      default_route_h: selectedPreset.works_h,
      default_route_f: selectedPreset.works_f,
    };

    return map[day];
  }

  return (
    <article className="value-card" style={{ gridColumn: "1 / -1" }}>
      <p className="value-card__eyebrow">Schedule setup</p>
      <h3 className="value-card__title">{driverName}</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Choose the preset, apply rotation behavior if needed, and define the
        default route-by-day planning shape. Rotation is interpreted internally;
        this surface focuses on the produced schedule.
      </p>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, 0.8fr)",
        }}
      >
        <select
          value={draft.preset_id}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              preset_id: e.target.value,
            }))
          }
          style={inputStyle}
        >
          <option value="">Select preset</option>
          {presetOptions.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.preset_code}
            </option>
          ))}
        </select>

        <select
          value={draft.rotation_mode}
          onChange={(e) =>
            setDraft((current) => ({
              ...current,
              rotation_mode: e.target.value,
            }))
          }
          style={inputStyle}
        >
          <option value="NONE">None</option>
          <option value="WEEKEND_ALT">Weekend alternate</option>
        </select>
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
          ["S", "default_route_s"],
          ["U", "default_route_u"],
          ["M", "default_route_m"],
          ["T", "default_route_t"],
          ["W", "default_route_w"],
          ["H", "default_route_h"],
          ["F", "default_route_f"],
        ].map(([label, key]) => {
          const enabled = dayEnabled(
            key as keyof Pick<
              ScheduleBaselineDraft,
              | "default_route_s"
              | "default_route_u"
              | "default_route_m"
              | "default_route_t"
              | "default_route_w"
              | "default_route_h"
              | "default_route_f"
            >
          );

          return (
            <div key={key} style={{ display: "grid", gap: 8 }}>
              <div style={{ textAlign: "center" }}>
                <span style={enabled ? activeDayStyle : checkboxLikeStyle}>
                  {label}
                </span>
              </div>
              <input
                value={draft[key as keyof ScheduleBaselineDraft] as string}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: e.target.value,
                  }))
                }
                placeholder={enabled ? "Route" : "OFF"}
                disabled={!enabled}
                style={{
                  ...inputStyle,
                  opacity: enabled ? 1 : 0.6,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="cta-row" style={{ marginTop: 16 }}>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={handleSave}
        >
          {busy ? "Saving..." : "Save schedule"}
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