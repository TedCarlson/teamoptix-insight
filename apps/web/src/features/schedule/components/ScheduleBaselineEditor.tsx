"use client";

import { useMemo, useState } from "react";
import { rotationLifecyclePreview } from "@/features/schedule/lib/scheduleWorkbench";

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

export type RouteOption = {
  value: string;
  label: string;
};

export type ScheduleBaselineDraft = {
  preset_id: string;
  rotation_mode: string;
  effective_start: string;
  anchor_date: string;
  rotation_works_s: boolean;
  rotation_works_u: boolean;
  rotation_works_m: boolean;
  rotation_works_t: boolean;
  rotation_works_w: boolean;
  rotation_works_h: boolean;
  rotation_works_f: boolean;
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

const compactSelectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  fontSize: 13,
};

const compactButtonStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #c9d4e4",
  background: "#f8fbff",
  color: "#17213a",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
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

type DayRouteKey =
  | "default_route_s"
  | "default_route_u"
  | "default_route_m"
  | "default_route_t"
  | "default_route_w"
  | "default_route_h"
  | "default_route_f";

const DAY_KEYS: Array<[string, DayRouteKey]> = [
  ["S", "default_route_s"],
  ["U", "default_route_u"],
  ["M", "default_route_m"],
  ["T", "default_route_t"],
  ["W", "default_route_w"],
  ["H", "default_route_h"],
  ["F", "default_route_f"],
];

const ROTATION_DAY_KEYS: Array<[string, keyof ScheduleBaselineDraft]> = [
  ["Sat", "rotation_works_s"],
  ["Sun", "rotation_works_u"],
  ["Mon", "rotation_works_m"],
  ["Tue", "rotation_works_t"],
  ["Wed", "rotation_works_w"],
  ["Thu", "rotation_works_h"],
  ["Fri", "rotation_works_f"],
];

export default function ScheduleBaselineEditor(props: {
  open: boolean;
  busy: boolean;
  driverName: string;
  presetOptions: PresetOption[];
  routeOptions: RouteOption[];
  initialDraft: ScheduleBaselineDraft;
  onClose: () => void;
  onSave: (draft: ScheduleBaselineDraft) => Promise<void>;
}) {
  const {
    open,
    busy,
    driverName,
    presetOptions,
    routeOptions,
    initialDraft,
    onClose,
    onSave,
  } = props;

  const [draft, setDraft] = useState<ScheduleBaselineDraft>(initialDraft);
  const [paintRouteValue, setPaintRouteValue] = useState("");

  const selectedPreset = useMemo(
    () => presetOptions.find((preset) => preset.id === draft.preset_id) ?? null,
    [presetOptions, draft.preset_id]
  );

  const rotationPreview = useMemo(
    () =>
      rotationLifecyclePreview({
        rotation_mode: draft.rotation_mode,
        anchor_date: draft.anchor_date,
        rotation_works_s: draft.rotation_works_s,
        rotation_works_u: draft.rotation_works_u,
        rotation_works_m: draft.rotation_works_m,
        rotation_works_t: draft.rotation_works_t,
        rotation_works_w: draft.rotation_works_w,
        rotation_works_h: draft.rotation_works_h,
        rotation_works_f: draft.rotation_works_f,
      }),
    [draft]
  );

  if (!open) return null;

  async function handleSave() {
    await onSave(draft);
  }

  function dayEnabled(day: DayRouteKey) {
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

  function applyPaintRoute() {
    if (!paintRouteValue) return;

    setDraft((current) => {
      const next = { ...current };

      DAY_KEYS.forEach(([, key]) => {
        if (dayEnabled(key)) {
          next[key] = paintRouteValue;
        }
      });

      return next;
    });
  }

  return (
    <article className="value-card" style={{ gridColumn: "1 / -1" }}>
      <p className="value-card__eyebrow">Schedule setup</p>
      <h3 className="value-card__title">{driverName}</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Choose the preset, apply rotation behavior if needed, choose the start
        date, and define the default route-by-day planning shape. Rotation is
        interpreted internally; this surface focuses on the produced schedule.
      </p>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns:
            "minmax(220px, 1fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr)",
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
          <option value="NONE">No rotation</option>
          <option value="WEEKEND_ALT">Use rotation</option>
        </select>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
            Effective start
          </span>
          <input
            type="date"
            value={draft.effective_start}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                effective_start: e.target.value,
                anchor_date: current.anchor_date || e.target.value,
              }))
            }
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
            Rotation anchor
          </span>
          <input
            type="date"
            value={draft.anchor_date}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                anchor_date: e.target.value,
              }))
            }
            style={inputStyle}
          />
        </label>
      </div>

      {draft.rotation_mode !== "NONE" ? (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 10,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #d6dfeb",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>
              Rotation days
            </span>

            {ROTATION_DAY_KEYS.map(([label, key]) => {
              const active = draft[key] === true;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      [key]: !current[key],
                    }))
                  }
                  style={{
                    minHeight: 28,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "#7bc48a" : "#d6dfeb"}`,
                    background: active ? "#e8f6eb" : "#fff",
                    color: active ? "#2f8f46" : "#64748b",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: busy ? "default" : "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>
              Next Schedule
            </span>

            {rotationPreview.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {rotationPreview.map((item) => (
                  <span
                    key={item.iso}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      minHeight: 26,
                      padding: "0 9px",
                      borderRadius: 999,
                      border: `1px solid ${item.state === "ON" ? "#7bc48a" : "#d6dfeb"}`,
                      background: item.state === "ON" ? "#e8f6eb" : "#fff",
                      color: item.state === "ON" ? "#2f8f46" : "#64748b",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {item.label} {item.iso.slice(5)} {item.state}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Select at least one rotation day to preview the lifecycle.
              </span>
            )}
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <select
          value={paintRouteValue}
          onChange={(e) => setPaintRouteValue(e.target.value)}
          style={{ ...compactSelectStyle, minWidth: 240 }}
        >
          <option value="">Paint route…</option>
          {routeOptions.map((route) => (
            <option key={route.value} value={route.value}>
              {route.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!paintRouteValue || busy}
          onClick={applyPaintRoute}
          style={{
            ...compactButtonStyle,
            opacity: !paintRouteValue || busy ? 0.6 : 1,
            cursor: !paintRouteValue || busy ? "default" : "pointer",
          }}
        >
          Apply
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(7, minmax(90px, 1fr))",
        }}
      >
        {DAY_KEYS.map(([label, key]) => {
          const enabled = dayEnabled(key);

          return (
            <div key={key} style={{ display: "grid", gap: 8 }}>
              <div style={{ textAlign: "center" }}>
                <span style={enabled ? activeDayStyle : checkboxLikeStyle}>
                  {label}
                </span>
              </div>
              <input
                value={draft[key]}
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