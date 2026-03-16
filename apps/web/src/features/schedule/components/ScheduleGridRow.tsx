"use client";

import ScheduleBaselineEditor, {
  type ScheduleBaselineDraft,
} from "@/features/schedule/components/ScheduleBaselineEditor";
import {
  isOn,
  nextWeekendDates,
  scheduleCellLabel,
} from "@/features/schedule/lib/scheduleWorkbench";

type ScheduleGridRowModel = {
  roster_member_id: string;
  full_name: string;
  tech_id?: string | null;

  preset_id: string | null;
  preset_code: string | null;

  preset_works_s: boolean | null;
  preset_works_u: boolean | null;
  preset_works_m: boolean | null;
  preset_works_t: boolean | null;
  preset_works_w: boolean | null;
  preset_works_h: boolean | null;
  preset_works_f: boolean | null;

  rotation_mode: string | null;
  anchor_date: string | null;

  default_route_s: string | null;
  default_route_u: string | null;
  default_route_m: string | null;
  default_route_t: string | null;
  default_route_w: string | null;
  default_route_h: string | null;
  default_route_f: string | null;

  schedule_pending: boolean;
};

type SchedulePresetRow = {
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

type Props = {
  row: ScheduleGridRowModel;
  isOpen: boolean;
  presets: SchedulePresetRow[];
  baselineBusy: boolean;
  baselineDraft: ScheduleBaselineDraft;
  onToggle: (rosterMemberId: string) => void;
  onClose: () => void;
  onSave: (draft: ScheduleBaselineDraft) => Promise<void>;
};

function schedulePill(text: string, kind: "off" | "on") {
  const isOff = kind === "off";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 34,
        height: 22,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${isOff ? "#d6dfeb" : "#7bc48a"}`,
        background: isOff ? "#f8fafc" : "#e8f6eb",
        color: isOff ? "#64748b" : "#2f8f46",
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  background: "#fff",
};

const compactCellStyle: React.CSSProperties = {
  padding: "8px 2px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  textAlign: "center",
  background: "#fff",
};

const rowActionButtonStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  background: "#f8fbff",
  border: "1px solid #c9d4e4",
  color: "#17213a",
  minHeight: 34,
  minWidth: 74,
  padding: "0 14px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: "none",
  cursor: "pointer",
};

export default function ScheduleGridRow(props: Props) {
  const {
    row,
    isOpen,
    presets,
    baselineBusy,
    baselineDraft,
    onToggle,
    onClose,
    onSave,
  } = props;

  const hasPreset = Boolean(row.preset_id);

  const dayOn = {
    s: hasPreset && isOn(row.preset_works_s),
    u: hasPreset && isOn(row.preset_works_u),
    m: hasPreset && isOn(row.preset_works_m),
    t: hasPreset && isOn(row.preset_works_t),
    w: hasPreset && isOn(row.preset_works_w),
    h: hasPreset && isOn(row.preset_works_h),
    f: hasPreset && isOn(row.preset_works_f),
  };

  const weekendPreview = nextWeekendDates(row.anchor_date, row.rotation_mode);

  return (
    <>
      <tr>
        <td style={cellStyle}>
          <div style={{ display: "grid", gap: 2 }}>
            <span>{row.full_name}</span>
            <span
              style={{
                fontSize: 11,
                lineHeight: 1.2,
                color: row.schedule_pending ? "#c62828" : "#7b879c",
              }}
            >
              {row.schedule_pending ? "schedule pending" : " "}
            </span>
          </div>
        </td>

        <td style={cellStyle}>
          {row.preset_code ?? <span style={{ color: "#c62828" }}>—</span>}
        </td>

        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.s, row.default_route_s),
            dayOn.s ? "on" : "off"
          )}
        </td>
        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.u, row.default_route_u),
            dayOn.u ? "on" : "off"
          )}
        </td>
        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.m, row.default_route_m),
            dayOn.m ? "on" : "off"
          )}
        </td>
        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.t, row.default_route_t),
            dayOn.t ? "on" : "off"
          )}
        </td>
        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.w, row.default_route_w),
            dayOn.w ? "on" : "off"
          )}
        </td>
        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.h, row.default_route_h),
            dayOn.h ? "on" : "off"
          )}
        </td>
        <td style={compactCellStyle}>
          {schedulePill(
            scheduleCellLabel(dayOn.f, row.default_route_f),
            dayOn.f ? "on" : "off"
          )}
        </td>

        <td style={cellStyle}>
          {row.rotation_mode ?? <span style={{ color: "#64748b" }}>—</span>}
        </td>

        <td
          style={{
            ...cellStyle,
            textAlign: "right",
          }}
        >
          <button
            type="button"
            style={rowActionButtonStyle}
            onClick={() => onToggle(row.roster_member_id)}
          >
            {isOpen ? "Close" : row.schedule_pending ? "Set Up" : "Edit"}
          </button>
        </td>
      </tr>

      {isOpen ? (
        <tr>
          <td
            colSpan={11}
            style={{
              padding: 0,
              borderBottom: "1px solid #e6edf5",
              background: "#f8fafc",
            }}
          >
            <div
              style={{
                padding: 14,
                borderTop: "1px solid #e6edf5",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  marginBottom: 10,
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  fontSize: 12,
                  color: "#5c6b84",
                }}
              >
                <span>
                  Anchor:{" "}
                  <strong style={{ color: "#17213a" }}>
                    {row.anchor_date ?? "will set on save"}
                  </strong>
                </span>

                {weekendPreview ? (
                  <span>
                    Next two weekend shifts:{" "}
                    <strong style={{ color: "#17213a" }}>
                      {weekendPreview.first}
                    </strong>{" "}
                    and{" "}
                    <strong style={{ color: "#17213a" }}>
                      {weekendPreview.second}
                    </strong>
                  </span>
                ) : row.rotation_mode === "WEEKEND_ALT" ? (
                  <span>
                    Next two weekend shifts will calculate once anchor is
                    established.
                  </span>
                ) : null}
              </div>

              <ScheduleBaselineEditor
                open={true}
                busy={baselineBusy}
                driverName={row.full_name}
                presetOptions={presets}
                initialDraft={baselineDraft}
                onClose={onClose}
                onSave={onSave}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}