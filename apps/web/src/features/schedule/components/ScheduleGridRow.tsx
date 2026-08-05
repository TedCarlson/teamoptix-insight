"use client";

import ScheduleBaselineEditor, {
  type RouteOption,
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

  role_label: string | null;
  role_bucket: "DRIVER_HELPER" | "OTHER";
  employment_status: string | null;

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
  effective_start: string | null;

  rotation_works_s: boolean | null;
  rotation_works_u: boolean | null;
  rotation_works_m: boolean | null;
  rotation_works_t: boolean | null;
  rotation_works_w: boolean | null;
  rotation_works_h: boolean | null;
  rotation_works_f: boolean | null;

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
  routeOptions: RouteOption[];
  baselineBusy: boolean;
  baselineDraft: ScheduleBaselineDraft;
  onToggle: (rosterMemberId: string) => void;
  onClose: () => void;
  onSave: (draft: ScheduleBaselineDraft) => Promise<void>;
  onRemove: (rosterMemberId: string) => Promise<void>;
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

function roleChip(roleLabel: string | null) {
  const upper = (roleLabel ?? "").trim().toUpperCase();

  if (!upper) return null;
  if (!upper.includes("DRIVER") && !upper.includes("HELPER")) return null;

  const label = upper.includes("HELPER") ? "Helper" : "Driver";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        background: "#eef4ff",
        border: "1px solid #c9d7f2",
        color: "#32508f",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

function traineeChip(employmentStatus: string | null) {
  if (employmentStatus !== "Trainee") return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#b45309",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      Trainee
    </span>
  );
}

function rotationLabel(rotationMode: string | null) {
  if (!rotationMode) return "—";
  if (rotationMode === "NONE") return "None";
  if (rotationMode === "WEEKEND_ALT") return "Weekend Alt";
  return rotationMode.replaceAll("_", " ");
}

function rotationChip(rotationMode: string | null) {
  if (!rotationMode || rotationMode === "NONE") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 20,
          padding: "0 8px",
          borderRadius: 999,
          border: "1px solid #d6dfeb",
          background: "#f8fafc",
          color: "#64748b",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        None
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        border: "1px solid #c9d7f2",
        background: "#eef4ff",
        color: "#32508f",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {rotationLabel(rotationMode)}
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

const removeButtonStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  background: "#fff",
  border: "1px solid #efc4be",
  color: "#b42318",
  minHeight: 36,
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
    routeOptions,
    baselineBusy,
    baselineDraft,
    onToggle,
    onClose,
    onSave,
    onRemove,
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

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle(row.roster_member_id);
  }

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => onToggle(row.roster_member_id)}
        onKeyDown={handleRowKeyDown}
        style={{
          cursor: "pointer",
        }}
      >
        <td style={cellStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>{row.full_name}</span>
              {roleChip(row.role_label)}
              {traineeChip(row.employment_status)}
            </div>

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
          <div
            style={{
              minWidth: 0,
              fontSize: 12,
              fontWeight: 600,
              color: row.preset_code ? "#7b879c" : "#c62828",
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {row.preset_code ?? "—"}
          </div>
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
          <div style={{ display: "grid", gap: 4 }}>
            <div>{rotationChip(row.rotation_mode)}</div>
            <span
              style={{
                fontSize: 11,
                lineHeight: 1.2,
                color: "#7b879c",
              }}
            >
              {row.rotation_mode === "WEEKEND_ALT"
                ? row.anchor_date
                  ? `anchor ${row.anchor_date}`
                  : "anchor pending"
                : " "}
            </span>
          </div>
        </td>

      </tr>

      {isOpen ? (
        <tr>
          <td
            colSpan={10}
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
                  marginBottom: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {rotationChip(row.rotation_mode)}
                  <span
                    style={{
                      fontSize: 12,
                      color: "#5c6b84",
                    }}
                  >
                    Rotation behavior is applied per person from this row’s
                    schedule setup.
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    fontSize: 12,
                    color: "#5c6b84",
                  }}
                >
                  <span>
                    Start:{" "}
                    <strong style={{ color: "#17213a" }}>
                      {row.effective_start ?? "will set on save"}
                    </strong>
                  </span>

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
              </div>

              <ScheduleBaselineEditor
                key={`${row.roster_member_id}:${baselineDraft.preset_id}:${baselineDraft.rotation_mode}:${baselineDraft.effective_start}:${baselineDraft.anchor_date}`}
                open={true}
                busy={baselineBusy}
                driverName={row.full_name}
                presetOptions={presets}
                routeOptions={routeOptions}
                initialDraft={baselineDraft}
                onClose={onClose}
                onSave={onSave}
              />

              {row.preset_id ? (
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    style={removeButtonStyle}
                    disabled={baselineBusy}
                    onClick={() => onRemove(row.roster_member_id)}
                  >
                    Remove schedule
                  </button>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
