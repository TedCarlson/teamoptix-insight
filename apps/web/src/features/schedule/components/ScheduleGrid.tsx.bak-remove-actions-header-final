"use client";

import type {
  RouteOption,
  ScheduleBaselineDraft,
} from "@/features/schedule/components/ScheduleBaselineEditor";
import ScheduleGridRow from "@/features/schedule/components/ScheduleGridRow";

type ScheduleGridRowModel = {
  roster_member_id: string;
  full_name: string;
  tech_id?: string | null;

  role_label: string | null;
  role_bucket: "DRIVER_HELPER" | "OTHER";

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
  loading: boolean;
  rows: ScheduleGridRowModel[];
  presets: SchedulePresetRow[];
  routeOptions: RouteOption[];
  inlineOpenRosterId: string | null;
  baselineBusy: boolean;
  getBaselineDraft: (row: ScheduleGridRowModel) => ScheduleBaselineDraft;
  onToggleInlineEditor: (rosterMemberId: string) => void;
  onCloseInlineEditor: () => void;
  onSaveBaseline: (draft: ScheduleBaselineDraft) => Promise<void>;
  onRemoveSchedule: (rosterMemberId: string) => Promise<void>;
};

const headerBaseStyle: React.CSSProperties = {
  borderBottom: "1px solid #d6dfeb",
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#5c6b84",
  verticalAlign: "middle",
  background: "#fff",
};

const headerStyle: React.CSSProperties = {
  ...headerBaseStyle,
  textAlign: "left",
  padding: "10px 10px",
};

const headerStyleCompact: React.CSSProperties = {
  ...headerBaseStyle,
  textAlign: "center",
  padding: "10px 2px",
};

export default function ScheduleGrid(props: Props) {
  const {
    loading,
    rows,
    presets,
    routeOptions,
    inlineOpenRosterId,
    baselineBusy,
    getBaselineDraft,
    onToggleInlineEditor,
    onCloseInlineEditor,
    onSaveBaseline,
    onRemoveSchedule,
  } = props;

  const stickyTopHeader = 0;

  return (
    <div
      style={{
        marginTop: 16,
        maxHeight: "70vh",
        overflow: "auto",
        border: "1px solid #d6dfeb",
        borderRadius: 28,
        background: "#fff",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: "18%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "7.5%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "8%" }} />
        </colgroup>

        <thead>
          <tr
            style={{
              position: "sticky",
              top: stickyTopHeader,
              zIndex: 4,
              background: "#fff",
            }}
          >
            <th style={headerStyle}>Driver</th>
            <th
              style={headerStyle}
              title="Recurring production-week pattern used to hydrate planning days."
            >
              Preset
            </th>
            <th style={headerStyleCompact}>S</th>
            <th style={headerStyleCompact}>U</th>
            <th style={headerStyleCompact}>M</th>
            <th style={headerStyleCompact}>T</th>
            <th style={headerStyleCompact}>W</th>
            <th style={headerStyleCompact}>H</th>
            <th style={headerStyleCompact}>F</th>
            <th style={headerStyle}>Rotation</th>
            <th style={headerStyle}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={11} style={{ padding: 24 }}>
                Loading schedule...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={11} style={{ padding: 24 }}>
                No schedule rows match the current view.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <ScheduleGridRow
                key={row.roster_member_id}
                row={row}
                isOpen={inlineOpenRosterId === row.roster_member_id}
                presets={presets}
                routeOptions={routeOptions}
                baselineBusy={baselineBusy}
                baselineDraft={getBaselineDraft(row)}
                onToggle={onToggleInlineEditor}
                onClose={onCloseInlineEditor}
                onSave={onSaveBaseline}
                onRemove={onRemoveSchedule}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}