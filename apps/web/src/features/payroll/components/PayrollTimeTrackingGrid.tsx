"use client";

import { useEffect, useMemo, useState } from "react";
import PayrollWeekControls from "@/features/payroll/components/PayrollWeekControls";
import { compactDayCode, weekDaysForEnd } from "@/features/payroll/lib/payroll.date";
import {
  formatClockTime,
  formatDuration,
  stateLabel,
  summarizeTimeKeepingRows,
  type PayrollTimeKeepingRow,
} from "@/features/payroll/lib/payroll.timekeeping";

type TimeTrackingView = "overview" | "time-sheet" | "duty-hours" | "dot-hours";

type DswTimeRow = {
  batch_id: string;
  service_date: string;
  source_row_index: number;
  roster_member_id: string | null;
  person_name: string | null;
  worker_type: string | null;
  dswid: string | null;
  driver_name: string | null;
  route_name: string | null;
  wa_number: string | null;
  on_duty_hours: number | null;
  on_road_hours: number | null;
  potential_dot_hours_violations: number | null;
  next_available_on_duty: string | null;
};

type TimeTrackingPayload = {
  driver_rows?: PayrollTimeKeepingRow[];
  rows?: PayrollTimeKeepingRow[];
  dsw_rows?: DswTimeRow[];
};

type BreadcrumbRow = {
  id: string;
  roster_member_id: string | null;
  service_date: string;
  captured_at: string;
  device_captured_at: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  tracking_context: string;
  source_activity_event_id: string | null;
  employee_name: string | null;
  worker_type: string | null;
};

type BreadcrumbPayload = {
  rows?: BreadcrumbRow[];
};

type TimeSheetWeekRow = {
  key: string;
  employee_name: string;
  worker_type: string | null;
  days: PayrollTimeKeepingRow[];
  byDate: Map<string, PayrollTimeKeepingRow>;
};

type TimekeepingOverviewSource =
  | "Matched"
  | "DSW Generated"
  | "Clock Only"
  | "Needs Clock Out";

type TimekeepingOverviewRow = {
  key: string;
  roster_member_id: string | null;
  service_date: string;
  employee_name: string;
  worker_type: string | null;
  clock_in: string | null;
  clock_out: string | null;
  state: PayrollTimeKeepingRow["state"] | "DSW_GENERATED";
  event_count: number;
  route_name: string | null;
  wa_number: string | null;
  on_duty_hours: number | null;
  on_road_hours: number | null;
  source_label: TimekeepingOverviewSource;
};

type PayrollTimeTrackingGridProps = {
  slug: string;
  weekEnd: string;
  setWeekEnd: (value: string) => void;
};

const thStyle = {
  position: "sticky" as const,
  top: 0,
  background: "#f8fafc",
  borderBottom: "1px solid #e6edf5",
  padding: "9px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  textAlign: "left" as const,
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "9px 10px",
  color: "#334155",
  fontSize: 13,
};

function hours(value: number | null) {
  return value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function durationHours(clockIn: string | null, clockOut: string | null) {
  if (!clockIn || !clockOut) return null;

  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return Number(((end - start) / 3_600_000).toFixed(2));
}

function dotRiskLabel(row: DswTimeRow) {
  const violations = Number(row.potential_dot_hours_violations ?? 0);
  const duty = Number(row.on_duty_hours ?? 0);

  if (violations > 0 || duty >= 70) return "Breach";
  if (duty >= 60) return "Risk";
  if (duty > 0) return "Clear";
  return "No signal";
}

type DswDriverWeekRow = {
  key: string;
  driver_name: string;
  total_duty_hours: number;
  total_road_hours: number;
  dot_violations: number;
  days: DswTimeRow[];
  byDate: Map<string, DswTimeRow>;
};

function buildDswDriverWeekRows(rows: DswTimeRow[]) {
  const groups = new Map<string, DswTimeRow[]>();

  for (const row of rows) {
    const key = row.roster_member_id ?? row.person_name ?? row.driver_name ?? `unknown-${row.source_row_index}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, rowDays]) => {
      const byDate = new Map<string, DswTimeRow>();
      const sortedDays = [...rowDays].sort((a, b) => a.service_date.localeCompare(b.service_date));

      for (const row of sortedDays) byDate.set(row.service_date, row);

      return {
        key,
        driver_name: sortedDays[0]?.person_name ?? sortedDays[0]?.driver_name ?? "Unknown driver",
        total_duty_hours: sortedDays.reduce((sum, row) => sum + Number(row.on_duty_hours ?? 0), 0),
        total_road_hours: sortedDays.reduce((sum, row) => sum + Number(row.on_road_hours ?? 0), 0),
        dot_violations: sortedDays.reduce((sum, row) => sum + Number(row.potential_dot_hours_violations ?? 0), 0),
        days: sortedDays,
        byDate,
      };
    })
    .sort((a, b) => a.driver_name.localeCompare(b.driver_name));
}

function weekDotSignal(row: DswDriverWeekRow) {
  if (row.dot_violations > 0 || row.total_duty_hours >= 70) return "Breach";
  if (row.total_duty_hours >= 60) return "Risk";
  if (row.total_duty_hours > 0) return "Clear";
  return "No signal";
}

function buildTimeSheetWeekRows(rows: PayrollTimeKeepingRow[]) {
  const groups = new Map<string, PayrollTimeKeepingRow[]>();

  for (const row of rows) {
    const key = row.roster_member_id ?? row.full_name ?? "unknown";
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, rowDays]) => {
      const byDate = new Map<string, PayrollTimeKeepingRow>();
      const sortedDays = [...rowDays].sort((a, b) => a.service_date.localeCompare(b.service_date));

      for (const row of sortedDays) byDate.set(row.service_date, row);

      return {
        key,
        employee_name: sortedDays[0]?.full_name ?? "Unknown driver",
        worker_type: sortedDays[0]?.worker_type ?? null,
        days: sortedDays,
        byDate,
      };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

function timekeepingOverviewKey(rosterMemberId: string | null, name: string | null, serviceDate: string) {
  return `${rosterMemberId ?? name ?? "unknown"}|${serviceDate}`;
}

function buildTimekeepingOverviewRows(
  driverRows: PayrollTimeKeepingRow[],
  dswRows: DswTimeRow[]
): TimekeepingOverviewRow[] {
  const byKey = new Map<string, TimekeepingOverviewRow>();

  for (const row of driverRows) {
    const key = timekeepingOverviewKey(row.roster_member_id, row.full_name, row.service_date);
    byKey.set(key, {
      key,
      roster_member_id: row.roster_member_id,
      service_date: row.service_date,
      employee_name: row.full_name ?? "Unknown driver",
      worker_type: row.worker_type,
      clock_in: row.clock_in,
      clock_out: row.clock_out,
      state: row.state,
      event_count: row.event_count,
      route_name: null,
      wa_number: null,
      on_duty_hours: null,
      on_road_hours: null,
      source_label: row.clock_in && !row.clock_out ? "Needs Clock Out" : "Clock Only",
    });
  }

  for (const row of dswRows) {
    const employeeName = row.person_name ?? row.driver_name ?? "Unknown driver";
    const key = timekeepingOverviewKey(row.roster_member_id, employeeName, row.service_date);
    const existing = byKey.get(key);

    if (existing) {
      byKey.set(key, {
        ...existing,
        worker_type: existing.worker_type ?? row.worker_type,
        route_name: row.route_name,
        wa_number: row.wa_number,
        on_duty_hours: row.on_duty_hours,
        on_road_hours: row.on_road_hours,
        source_label:
          existing.clock_in && !existing.clock_out ? "Needs Clock Out" : "Matched",
      });
      continue;
    }

    byKey.set(key, {
      key,
      roster_member_id: row.roster_member_id,
      service_date: row.service_date,
      employee_name: employeeName,
      worker_type: row.worker_type,
      clock_in: null,
      clock_out: null,
      state: "DSW_GENERATED",
      event_count: 0,
      route_name: row.route_name,
      wa_number: row.wa_number,
      on_duty_hours: row.on_duty_hours,
      on_road_hours: row.on_road_hours,
      source_label: "DSW Generated",
    });
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.service_date !== b.service_date) {
      return b.service_date.localeCompare(a.service_date);
    }

    return a.employee_name.localeCompare(b.employee_name);
  });
}

function overviewSourceStyle(source: TimekeepingOverviewSource) {
  if (source === "Needs Clock Out") {
    return {
      background: "#fef2f2",
      border: "1px solid #fecaca",
      color: "#991b1b",
    };
  }

  if (source === "DSW Generated") {
    return {
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      color: "#1d4ed8",
    };
  }

  if (source === "Matched") {
    return {
      background: "#ecfdf5",
      border: "1px solid #bbf7d0",
      color: "#047857",
    };
  }

  return {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#475569",
  };
}

function renderSourceDot(source: TimekeepingOverviewSource) {
  const sourceStyle = overviewSourceStyle(source);

  return (
    <span
      aria-label={source}
      title={source}
      style={{
        ...sourceStyle,
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 999,
        padding: 0,
        flex: "0 0 auto",
        borderWidth: 2,
        boxShadow: `0 0 0 2px ${sourceStyle.background}`,
      }}
    />
  );
}

function renderOverviewLegend() {
  const items: TimekeepingOverviewSource[] = [
    "Matched",
    "DSW Generated",
    "Clock Only",
    "Needs Clock Out",
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        color: "#64748b",
        fontSize: 11,
        fontWeight: 850,
      }}
    >
      <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence</span>
      {items.map((item) => (
        <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {renderSourceDot(item)}
          {item}
        </span>
      ))}
    </div>
  );
}

function renderOverviewRows(
  driverRows: PayrollTimeKeepingRow[],
  dswRows: DswTimeRow[],
  days: string[]
) {
  const overviewRows = buildTimekeepingOverviewRows(driverRows, dswRows);
  const groups = new Map<string, TimekeepingOverviewRow[]>();

  for (const row of overviewRows) {
    const key = row.roster_member_id ?? row.employee_name;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  const weeklyRows = Array.from(groups.entries())
    .map(([key, rowDays]) => {
      const sortedDays = [...rowDays].sort((a, b) => a.service_date.localeCompare(b.service_date));
      const byDate = new Map<string, TimekeepingOverviewRow>();

      for (const row of sortedDays) {
        byDate.set(row.service_date, row);
      }

      const totalClockHours = sortedDays.reduce(
        (sum, row) => sum + Number(durationHours(row.clock_in, row.clock_out) ?? 0),
        0
      );
      const totalDutyHours = sortedDays.reduce(
        (sum, row) => sum + Number(row.on_duty_hours ?? 0),
        0
      );
      const totalRoadHours = sortedDays.reduce(
        (sum, row) => sum + Number(row.on_road_hours ?? 0),
        0
      );

      const sourceLabels = new Set(sortedDays.map((row) => row.source_label));
      const signal = sourceLabels.has("Needs Clock Out")
        ? "Needs Clock Out"
        : sourceLabels.has("DSW Generated") && sourceLabels.size === 1
          ? "DSW Generated"
          : sourceLabels.has("Clock Only") && !sourceLabels.has("Matched")
            ? "Clock Only"
            : "Matched";

      return {
        key,
        employee_name: sortedDays[0]?.employee_name ?? "Unknown driver",
        worker_type: sortedDays[0]?.worker_type ?? null,
        totalClockHours,
        totalDutyHours,
        totalRoadHours,
        signal,
        days: sortedDays,
        byDate,
      };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1240 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
              Employee
            </th>
            {days.map((day) => (
              <th key={day} style={{ ...thStyle, textAlign: "center", minWidth: 118, padding: "7px 4px" }}>
                {compactDayCode(day)}
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{day.slice(5)}</div>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: "right" }}>Clock</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Duty</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Road</th>
          </tr>
        </thead>
        <tbody>
          {weeklyRows.length === 0 ? (
            <tr>
              <td colSpan={days.length + 4} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No clock or DSW activity found for this week.
              </td>
            </tr>
          ) : (
            weeklyRows.map((row) => (
              <tr key={row.key} style={{ background: "#fff" }}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 2, background: "#fff", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
                  <strong>{row.employee_name}</strong>
                  <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 800 }}>
                    {row.worker_type ?? "—"}
                  </div>
                </td>
                {days.map((day) => {
                  const dayRow = row.byDate.get(day);

                  return (
                    <td key={day} style={{ ...tdStyle, textAlign: "center", verticalAlign: "top", padding: "7px 4px" }}>
                      {dayRow ? (
                        <div style={{ display: "grid", gap: 2, justifyItems: "center", lineHeight: 1.08 }}>
                          {dayRow.clock_in ? (
                            <strong style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {renderSourceDot(dayRow.source_label)}
                              <span>{formatClockTime(dayRow.clock_in)}</span>
                              <span style={{ color: "#94a3b8" }}>→</span>
                              <span>{formatClockTime(dayRow.clock_out)}</span>
                            </strong>
                          ) : (
                            <strong style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              {renderSourceDot(dayRow.source_label)}
                              <span>{hours(dayRow.on_duty_hours)} duty</span>
                            </strong>
                          )}

                          {dayRow.clock_in ? (
                            <span style={{ color: "#475569", fontSize: 10 }}>
                              {formatDuration(dayRow.clock_in, dayRow.clock_out)}
                            </span>
                          ) : (
                            <span style={{ color: "#475569", fontSize: 10 }}>
                              {hours(dayRow.on_road_hours)} road
                            </span>
                          )}

                          <span style={{ color: "#94a3b8", fontSize: 9 }}>
                            {dayRow.route_name ?? "—"} · WA {dayRow.wa_number ?? "—"}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontWeight: 900 }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>
                  {hours(row.totalClockHours)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>
                  {hours(row.totalDutyHours)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>
                  {hours(row.totalRoadHours)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}


function breadcrumbKey(rosterMemberId: string | null, serviceDate: string) {
  return `${rosterMemberId ?? "unknown"}|${serviceDate}`;
}

function mapEmbedSrc(row: BreadcrumbRow) {
  const delta = 0.002;
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);

  return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta},${lat - delta},${lon + delta},${lat + delta}&layer=mapnik&marker=${lat},${lon}`;
}

function mapsHref(row: BreadcrumbRow) {
  return `https://www.google.com/maps?q=${row.latitude},${row.longitude}`;
}

function breadcrumbForContext(
  rows: BreadcrumbRow[],
  context: "CLOCK_IN" | "CLOCK_OUT"
) {
  return rows.find((row) => row.tracking_context === context) ?? null;
}

function TimeEvidenceButton(props: {
  time: string;
  breadcrumb: BreadcrumbRow | null;
  onSelect: (row: BreadcrumbRow) => void;
}) {
  if (!props.breadcrumb) {
    return <span>{props.time}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.breadcrumb!)}
      style={{
        border: 0,
        background: "transparent",
        padding: 0,
        color: "#0f172a",
        font: "inherit",
        fontWeight: 900,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
      title="View location evidence"
    >
      <span>{props.time}</span>
      <span style={{ color: "#2563eb", fontSize: 10 }}>📍</span>
    </button>
  );
}

function renderTimeSheetRows(
  rows: PayrollTimeKeepingRow[],
  days: string[],
  breadcrumbs: BreadcrumbRow[],
  setSelectedBreadcrumb: (row: BreadcrumbRow) => void
) {
  const weeklyRows = buildTimeSheetWeekRows(rows);
  const breadcrumbsByDriverDay = new Map<string, BreadcrumbRow[]>();

  for (const row of breadcrumbs) {
    const key = breadcrumbKey(row.roster_member_id, row.service_date);
    const current = breadcrumbsByDriverDay.get(key) ?? [];
    current.push(row);
    breadcrumbsByDriverDay.set(key, current);
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1060 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
              Employee
            </th>
            {days.map((day) => (
              <th key={day} style={{ ...thStyle, textAlign: "center", minWidth: 92, padding: "7px 4px" }}>
                {compactDayCode(day)}
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{day.slice(5)}</div>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: "right" }}>Rows</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {weeklyRows.length === 0 ? (
            <tr>
              <td colSpan={days.length + 3} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No clock activity found for this week.
              </td>
            </tr>
          ) : (
            weeklyRows.map((row) => (
              <tr key={row.key} style={{ background: "#fff" }}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 2, background: "#fff", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
                  <strong>{row.employee_name}</strong>
                  <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 800 }}>{row.worker_type ?? "—"}</div>
                </td>
                {days.map((day) => {
                  const dayRow = row.byDate.get(day);
                  const breadcrumbRows =
                    breadcrumbsByDriverDay.get(
                      breadcrumbKey(
                        dayRow?.roster_member_id ?? row.days[0]?.roster_member_id ?? null,
                        day
                      )
                    ) ?? [];

                  const clockInBreadcrumb = breadcrumbForContext(breadcrumbRows, "CLOCK_IN");
                  const clockOutBreadcrumb = breadcrumbForContext(breadcrumbRows, "CLOCK_OUT");

                  return (
                    <td key={day} style={{ ...tdStyle, textAlign: "center", verticalAlign: "top", padding: "7px 4px" }}>
                      {dayRow ? (
                        <div style={{ display: "grid", gap: 2, justifyItems: "center", lineHeight: 1.08 }}>
                          <strong style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <TimeEvidenceButton
                              time={formatClockTime(dayRow.clock_in)}
                              breadcrumb={clockInBreadcrumb}
                              onSelect={setSelectedBreadcrumb}
                            />
                            <span style={{ color: "#94a3b8" }}>→</span>
                            <TimeEvidenceButton
                              time={formatClockTime(dayRow.clock_out)}
                              breadcrumb={clockOutBreadcrumb}
                              onSelect={setSelectedBreadcrumb}
                            />
                          </strong>
                          <span style={{ color: "#475569", fontSize: 10 }}>{formatDuration(dayRow.clock_in, dayRow.clock_out)}</span>
                          <span style={{ color: "#94a3b8", fontSize: 9 }}>{stateLabel(dayRow.state)}</span>
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontWeight: 900 }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>
                  {row.days.reduce((sum, item) => sum + item.event_count, 0)}
                </td>
                <td style={tdStyle}>{row.days.some((item) => item.state === "CLOCKED_IN") ? "Active" : "Closed"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderDriverRows(rows: PayrollTimeKeepingRow[]) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 920 }}>
        <thead>
          <tr>
            <th style={thStyle}>Driver</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Clock In</th>
            <th style={thStyle}>Clock Out</th>
            <th style={thStyle}>Duration</th>
            <th style={thStyle}>State</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Events</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No clock activity found for this week.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.roster_member_id}-${row.service_date}`}>
                <td style={tdStyle}><strong>{row.full_name ?? "Unknown driver"}</strong></td>
                <td style={tdStyle}>{row.worker_type ?? "—"}</td>
                <td style={tdStyle}>{row.service_date}</td>
                <td style={tdStyle}>{formatClockTime(row.clock_in)}</td>
                <td style={tdStyle}>{formatClockTime(row.clock_out)}</td>
                <td style={tdStyle}>{formatDuration(row.clock_in, row.clock_out)}</td>
                <td style={tdStyle}>{stateLabel(row.state)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{row.event_count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderDutyRows(rows: DswTimeRow[], days: string[]) {
  const weeklyRows = buildDswDriverWeekRows(rows);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1060 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
              Employee
            </th>
            {days.map((day) => (
              <th key={day} style={{ ...thStyle, textAlign: "center", minWidth: 78, padding: "7px 4px" }}>
                {compactDayCode(day)}
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{day.slice(5)}</div>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: "right" }}>Duty</th>
            <th style={thStyle}>Signal</th>
          </tr>
        </thead>
        <tbody>
          {weeklyRows.length === 0 ? (
            <tr>
              <td colSpan={days.length + 3} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No finalized DSW duty-hour rows found for this week.
              </td>
            </tr>
          ) : (
            weeklyRows.map((row) => (
              <tr key={row.key} style={{ background: "#fff" }}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 2, background: "#fff", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
                  <strong>{row.driver_name}</strong>
                </td>
                {days.map((day) => {
                  const dayRow = row.byDate.get(day);

                  return (
                    <td key={day} style={{ ...tdStyle, textAlign: "center", verticalAlign: "top", padding: "7px 4px" }}>
                      {dayRow ? (
                        <div style={{ display: "grid", gap: 1, justifyItems: "center", lineHeight: 1.08 }}>
                          <strong>{hours(dayRow.on_duty_hours)}</strong>
                          <span style={{ color: "#475569", fontSize: 10 }}>WA {dayRow.wa_number ?? "—"}</span>
                          <span style={{ color: "#94a3b8", fontSize: 9 }}>{dayRow.next_available_on_duty ?? "—"}</span>
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontWeight: 900 }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{hours(row.total_duty_hours)}</td>
                <td style={tdStyle}>{weekDotSignal(row)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderDotRows(rows: DswTimeRow[], days: string[]) {
  const weeklyRows = buildDswDriverWeekRows(rows);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1060 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
              Employee
            </th>
            {days.map((day) => (
              <th key={day} style={{ ...thStyle, textAlign: "center", minWidth: 78, padding: "7px 4px" }}>
                {compactDayCode(day)}
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{day.slice(5)}</div>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: "right" }}>DOT Hours</th>
            <th style={thStyle}>70 / 8 Signal</th>
          </tr>
        </thead>
        <tbody>
          {weeklyRows.length === 0 ? (
            <tr>
              <td colSpan={days.length + 3} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No finalized DSW DOT-hour rows found for this week.
              </td>
            </tr>
          ) : (
            weeklyRows.map((row) => (
              <tr key={row.key} style={{ background: "#fff" }}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 2, background: "#fff", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
                  <strong>{row.driver_name}</strong>
                </td>
                {days.map((day) => {
                  const dayRow = row.byDate.get(day);

                  return (
                    <td key={day} style={{ ...tdStyle, textAlign: "center", verticalAlign: "top", padding: "7px 4px" }}>
                      {dayRow ? (
                        <div style={{ display: "grid", gap: 1, justifyItems: "center", lineHeight: 1.08 }}>
                          <strong>{dotRiskLabel(dayRow)}</strong>
                          <span style={{ color: "#475569", fontSize: 10 }}>{hours(dayRow.on_road_hours)} DOT</span>
                          <span style={{ color: "#94a3b8", fontSize: 9 }}>WA {dayRow.wa_number ?? "—"}</span>
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontWeight: 900 }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{hours(row.total_road_hours)}</td>
                <td style={tdStyle}>{weekDotSignal(row)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PayrollTimeTrackingGrid({
  slug,
  weekEnd,
  setWeekEnd,
}: PayrollTimeTrackingGridProps) {
  const [view, setView] = useState<TimeTrackingView>("overview");
  const [driverRows, setDriverRows] = useState<PayrollTimeKeepingRow[]>([]);
  const [dswRows, setDswRows] = useState<DswTimeRow[]>([]);
  const [breadcrumbRows, setBreadcrumbRows] = useState<BreadcrumbRow[]>([]);
  const [selectedBreadcrumb, setSelectedBreadcrumb] = useState<BreadcrumbRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => weekDaysForEnd(weekEnd), [weekEnd]);
  const summary = useMemo(() => summarizeTimeKeepingRows(driverRows), [driverRows]);
  const dswDutyRows = useMemo(() => dswRows.filter((row) => row.on_duty_hours != null), [dswRows]);
  const dotRows = useMemo(
    () => dswRows.filter((row) => row.on_duty_hours != null || row.potential_dot_hours_violations != null),
    [dswRows]
  );

  useEffect(() => {
    let active = true;

    async function loadTimeTracking() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/payroll/time-keeping?weekEnd=${weekEnd}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = (await res.json().catch(() => ({}))) as TimeTrackingPayload & { error?: string };

        if (!active) return;

        if (!res.ok) {
          setDriverRows([]);
          setDswRows([]);
          setBreadcrumbRows([]);
          setError(data?.error ?? "Failed to load time tracking.");
          return;
        }

        const nextDriverRows = Array.isArray(data?.driver_rows)
          ? data.driver_rows
          : Array.isArray(data?.rows)
            ? data.rows
            : [];

        setDriverRows(nextDriverRows);
        setDswRows(Array.isArray(data?.dsw_rows) ? data.dsw_rows : []);

        const breadcrumbResults = await Promise.all(
          days.map(async (day) => {
            const breadcrumbRes = await fetch(
              `/api/company/${slug}/driver/breadcrumbs?serviceDate=${day}`,
              {
                credentials: "include",
                cache: "no-store",
              }
            );

            const breadcrumbData = (await breadcrumbRes.json().catch(() => ({}))) as BreadcrumbPayload;

            return breadcrumbRes.ok && Array.isArray(breadcrumbData.rows)
              ? breadcrumbData.rows
              : [];
          })
        );

        if (!active) return;
        setBreadcrumbRows(breadcrumbResults.flat());
      } catch {
        if (!active) return;
        setDriverRows([]);
        setDswRows([]);
        setBreadcrumbRows([]);
        setError("Failed to load time tracking.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && weekEnd) void loadTimeTracking();

    return () => {
      active = false;
    };
  }, [slug, weekEnd, days]);

  const title =
    view === "overview"
      ? "Overview"
      : view === "time-sheet"
        ? "Time Sheet"
        : view === "duty-hours"
          ? "Duty Hours"
          : "DOT Hours";

  return (
    <section className="payroll-workspace">
      <div className="payroll-workspace-toolbar">
        <div>
          <p className="value-card__eyebrow">Time Tracking</p>
          <h2 className="app-card__title">{title}</h2>
        </div>

        <div className="payroll-workspace-toolbar__actions">
          <div className="workspace-view-picker">
            <span>View</span>
            <select
              className="workspace-select"
              value={view}
              onChange={(event) => setView(event.target.value as TimeTrackingView)}
            >
              <option value="overview">Overview</option>
              <option value="time-sheet">Time Sheet</option>
              <option value="duty-hours">Duty Hours</option>
              <option value="dot-hours">DOT Hours</option>
            </select>
          </div>

          <PayrollWeekControls
            weekEnd={weekEnd}
            setWeekEnd={setWeekEnd}
            rebuilding={false}
            onRebuild={() => undefined}
          />
        </div>
      </div>

      <div
        style={{
          border: "1px solid #e6edf5",
          borderRadius: 14,
          padding: 10,
          background: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          color: "#334155",
          fontSize: 13,
          fontWeight: 850,
        }}
      >
        <span>{driverRows.length} driver records · {dswRows.length} DSW rows</span>
        <span>
          {summary.activeSessions} active · {summary.closedSessions} closed · {summary.missingClockOut} missing clock out
        </span>
      </div>

      {view === "overview" ? renderOverviewLegend() : null}

      {error ? (
        <div style={{ color: "#991b1b", fontWeight: 800 }}>{error}</div>
      ) : null}

      {loading ? (
        <div className="muted">Loading time tracking...</div>
      ) : view === "duty-hours" ? (
        renderDutyRows(dswDutyRows, days)
      ) : view === "dot-hours" ? (
        renderDotRows(dotRows, days)
      ) : view === "time-sheet" ? (
        renderTimeSheetRows(driverRows, days, breadcrumbRows, setSelectedBreadcrumb)
      ) : (
        renderOverviewRows(driverRows, dswRows, days)
      )}

      {selectedBreadcrumb ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setSelectedBreadcrumb(null)}
        >
          <div
            style={{
              width: "min(1380px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e6edf5",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <p className="value-card__eyebrow" style={{ margin: 0 }}>Clock Location</p>
                <h3 className="app-card__title" style={{ margin: "4px 0 0" }}>
                  {selectedBreadcrumb.employee_name ?? "Employee location"}
                </h3>
                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                  {selectedBreadcrumb.tracking_context} · {formatClockTime(selectedBreadcrumb.captured_at)} · accuracy {selectedBreadcrumb.accuracy_meters ?? "—"}m
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a
                  className="button button--secondary"
                  href={mapsHref(selectedBreadcrumb)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Maps
                </a>
                <button type="button" className="button button--secondary" onClick={() => setSelectedBreadcrumb(null)}>
                  Close
                </button>
              </div>
            </div>

            <iframe
              title="Clock location map"
              src={mapEmbedSrc(selectedBreadcrumb)}
              style={{ width: "100%", height: "min(63vh, 640px)", border: 0, display: "block" }}
              loading="lazy"
            />

            <div style={{ padding: 12, color: "#64748b", fontSize: 12, fontWeight: 800 }}>
              {selectedBreadcrumb.latitude}, {selectedBreadcrumb.longitude}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
