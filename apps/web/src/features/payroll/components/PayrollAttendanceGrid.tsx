"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getReversedDispatchEventIds, type DispatchEventRow } from "@/features/dispatch/lib/dispatchSupport";
import type { RosterRow } from "@/features/people/types/roster.types";

type AttendanceCell = {
  present: boolean;
  callout: boolean;
  noShow: boolean;
  sources: string[];
  details: string[];
};

type AttendanceRow = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  days: Record<string, AttendanceCell>;
};

type PayrollSummaryRow = {
  roster_member_id: string | null;
  person_name: string;
  days_worked: number;
  worked_days?: string[];
  daily_pay_total: number;
  threshold_pay_total: number;
  estimated_total: number;
};

type PayrollActivityRow = {
  service_date: string;
  roster_member_id: string | null;
  person_name: string | null;
  attendance_status: string | null;
  source_kind: string | null;
  wa_number?: string | null;
  actual_delivery_stops?: number | null;
  threshold_pay_amount?: number | null;
};

type PayrollMetrics = {
  record_count: number;
  payable_days: number;
  estimated_payroll: number;
  estimated_threshold_pay: number;
  summary: PayrollSummaryRow[];
  activity: PayrollActivityRow[];
};

type PayrollView = "attendance" | "summary" | "detail";

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function currentWeekEndFriday() {
  const today = new Date();
  const day = today.getUTCDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  const friday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  friday.setUTCDate(friday.getUTCDate() + daysUntilFriday);
  return iso(friday);
}

function defaultPayrollWeekEndFriday() {
  return addDays(currentWeekEndFriday(), -7);
}

function weekDaysForEnd(weekEnd: string) {
  const start = addDays(weekEnd, -6);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function weekRangeLabel(weekEnd: string) {
  return `${addDays(weekEnd, -6)} → ${weekEnd}`;
}

function dayLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

function compactDayCode(value: string) {
  const weekday = new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    timeZone: "UTC",
  });

  if (weekday === "Thu") return "H";
  if (weekday === "Sun") return "U";
  return weekday.slice(0, 1).toUpperCase();
}

function workedDaysLabel(daysWorked: number, workedDays?: string[]) {
  const codes = (workedDays ?? []).map(compactDayCode).join("");
  return codes ? `${daysWorked} · ${codes}` : String(daysWorked);
}

function normalizedStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isActiveStatus(value: string | null | undefined) {
  return normalizedStatus(value) === "active";
}

function isDriverType(value: string | null | undefined) {
  return normalizedStatus(value) === "driver";
}

function payrollSummaryGroup(row: PayrollSummaryRow, rosterById: Map<string, RosterRow>) {
  const roster = row.roster_member_id ? rosterById.get(row.roster_member_id) : undefined;
  const driver = isDriverType(roster?.worker_type);
  const active = isActiveStatus(roster?.employment_status);

  if (driver && active) return "Drivers · Active";
  if (driver && !active) return "Drivers · Former";
  if (!driver && active) return "Other · Active";
  return "Other · Former / unmatched";
}

function ReportDayPills(props: { days: string[]; activity: PayrollActivityRow[] }) {
  const finalizedDays = new Set(
    props.activity
      .filter((row) => row.source_kind === "DSW_ACTUAL" && row.attendance_status === "present")
      .map((row) => row.service_date)
  );

  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ color: "#64748b" }}>Report days</span>
      {props.days.map((day) => {
        const hasFinal = finalizedDays.has(day);
        return (
          <span
            key={day}
            title={hasFinal ? `${day} included in report` : `${day} pending final DSW`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              border: `1px solid ${hasFinal ? "#bbf7d0" : "#e2e8f0"}`,
              background: hasFinal ? "#ecfdf5" : "#f8fafc",
              color: hasFinal ? "#166534" : "#94a3b8",
              borderRadius: 999,
              padding: "2px 7px",
              fontSize: 11,
              fontWeight: 950,
            }}
          >
            {hasFinal ? "✓" : "—"} {compactDayCode(day)}
          </span>
        );
      })}
    </span>
  );
}

function emptyCell(): AttendanceCell {
  return { present: false, callout: false, noShow: false, sources: [], details: [] };
}

function addSource(cell: AttendanceCell, source: string) {
  if (!cell.sources.includes(source)) cell.sources.push(source);
}

function addDetail(cell: AttendanceCell, detail: string | null | undefined) {
  if (!detail) return;
  if (!cell.details.includes(detail)) cell.details.push(detail);
}

function presentEventCode(code: string) {
  return [
    "ARRIVED",
    "ADD_DRIVER",
    "ASSIGN_DRIVER",
    "ASSIGN_HELPER",
    "ASSIGN_TRAINEE",
    "ADD_HELPER",
    "ADD_TRAINEE",
    "TECH_MOVE",
  ].includes(code);
}

function cellDisplay(cell: AttendanceCell) {
  if (cell.callout) return { label: "C", title: "Call-out", tone: "#92400e", bg: "#fffbeb", border: "#fde68a" };
  if (cell.noShow) return { label: "N", title: "No show", tone: "#991b1b", bg: "#fef2f2", border: "#fecaca" };
  if (cell.present) {
    const detailText = cell.details.length > 0 ? ` · ${cell.details.join(" · ")}` : "";
    return { label: "✓", title: `Present · ${cell.sources.join(", ")}${detailText}`, tone: "#166534", bg: "#ecfdf5", border: "#bbf7d0" };
  }
  return { label: "—", title: "No attendance signal", tone: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0" };
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "$—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PayrollAttendanceGrid() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [weekEnd, setWeekEnd] = useState(defaultPayrollWeekEndFriday);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [eventsByDay, setEventsByDay] = useState<Record<string, DispatchEventRow[]>>({});
  const [payrollMetrics, setPayrollMetrics] = useState<PayrollMetrics | null>(null);
  const [payrollView, setPayrollView] = useState<PayrollView>("attendance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => weekDaysForEnd(weekEnd), [weekEnd]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const rosterRes = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
          cache: "no-store",
        });

        const rosterData = await rosterRes.json();

        if (!rosterRes.ok) {
          throw new Error(rosterData?.error ?? "Failed to load roster.");
        }

        const [dispatchPayloads, payrollRes] = await Promise.all([
          Promise.all(
            days.map(async (day) => {
              const res = await fetch(`/api/company/${slug}/dispatch/day?date=${day}`, {
                credentials: "include",
                cache: "no-store",
              });

              const data = await res.json();
              if (!res.ok) throw new Error(data?.error ?? `Failed to load dispatch day ${day}.`);

              return [day, (data?.events ?? []) as DispatchEventRow[]] as const;
            })
          ),
          fetch(`/api/company/${slug}/payroll/activity?weekEnd=${weekEnd}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const payrollData = await payrollRes.json();

        if (!payrollRes.ok) {
          throw new Error(payrollData?.error ?? "Failed to load payroll metrics.");
        }

        if (!active) return;

        setRoster((rosterData?.roster ?? []) as RosterRow[]);
        setEventsByDay(Object.fromEntries(dispatchPayloads));
        const summary = ((payrollData?.summary ?? []) as PayrollSummaryRow[])
          .map((row) => ({
            roster_member_id: row.roster_member_id ?? null,
            person_name: row.person_name,
            days_worked: Number(row.days_worked ?? 0),
            worked_days: Array.isArray(row.worked_days) ? row.worked_days : [],
            daily_pay_total: Number(row.daily_pay_total ?? 0),
            threshold_pay_total: Number(row.threshold_pay_total ?? 0),
            estimated_total: Number(row.estimated_total ?? 0),
          }))
          .sort((a, b) => a.person_name.localeCompare(b.person_name));

        setPayrollMetrics({
          record_count: Number(payrollData?.record_count ?? 0),
          payable_days: summary.reduce((sum, row) => sum + row.days_worked, 0),
          estimated_payroll: Number(payrollData?.estimated_payroll ?? 0),
          estimated_threshold_pay: Number(payrollData?.estimated_threshold_pay ?? 0),
          summary,
          activity: ((payrollData?.activity ?? []) as PayrollActivityRow[]),
        });
      } catch (err) {
        if (!active) return;
        setRoster([]);
        setEventsByDay({});
        setPayrollMetrics(null);
        setError(err instanceof Error ? err.message : "Failed to load payroll attendance.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void load();

    return () => {
      active = false;
    };
  }, [slug, days, weekEnd]);

  const attendanceRows = useMemo<AttendanceRow[]>(() => {
    const activeRoster = roster
      .filter((person) => person.employment_status === "Active")
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    const rows = new Map<string, AttendanceRow>();

    for (const person of activeRoster) {
      rows.set(person.roster_member_id, {
        roster_member_id: person.roster_member_id,
        full_name: person.full_name,
        worker_type: person.worker_type,
        days: Object.fromEntries(days.map((day) => [day, emptyCell()])),
      });
    }

    for (const day of days) {
      const events = [...(eventsByDay[day] ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const reversed = getReversedDispatchEventIds(events);

      for (const event of events) {
        if (reversed.has(event.id)) continue;
        if (event.event_code.startsWith("UNDO_")) continue;

        const personId = event.person_roster_member_id;
        if (!personId) continue;

        const row = rows.get(personId);
        if (!row) continue;

        const cell = row.days[day] ?? emptyCell();

        if (presentEventCode(event.event_code)) {
          cell.present = true;
          addSource(cell, event.event_code);
        }

        if (event.event_code === "CALL_OUT") {
          cell.callout = true;
          addSource(cell, "CALL_OUT");
        }

        if (event.event_code === "NO_SHOW") {
          cell.noShow = true;
          addSource(cell, "NO_SHOW");
        }

        row.days[day] = cell;
      }
    }

    for (const activity of payrollMetrics?.activity ?? []) {
      if (activity.attendance_status !== "present") continue;
      if (!activity.service_date || !days.includes(activity.service_date)) continue;

      const personId = activity.roster_member_id;
      if (!personId) continue;

      const row = rows.get(personId);
      if (!row) continue;

      const cell = row.days[activity.service_date] ?? emptyCell();

      cell.present = true;
      cell.callout = false;
      cell.noShow = false;
      addSource(cell, activity.source_kind === "DSW_ACTUAL" ? "DSW" : "PAYROLL");

      if (activity.source_kind === "DSW_ACTUAL") {
        addDetail(cell, activity.wa_number ? `WA ${activity.wa_number}` : null);
        // Attendance stays compact: route worked only.
        // Stops and threshold overages belong in Detail.

      }

      row.days[activity.service_date] = cell;
    }

    return Array.from(rows.values()).filter((row) =>
      Object.values(row.days).some((cell) => cell.present || cell.callout || cell.noShow)
    );
  }, [days, eventsByDay, payrollMetrics?.activity, roster]);

  const presentCount = attendanceRows.reduce(
    (sum, row) => sum + Object.values(row.days).filter((cell) => cell.present).length,
    0
  );

  const rosterById = useMemo(() => {
    return new Map(roster.map((person) => [person.roster_member_id, person]));
  }, [roster]);

  const groupedSummaryRows = useMemo(() => {
    const groups = new Map<string, PayrollSummaryRow[]>();

    for (const row of payrollMetrics?.summary ?? []) {
      const group = payrollSummaryGroup(row, rosterById);
      const current = groups.get(group) ?? [];
      current.push(row);
      groups.set(group, current);
    }

    return Array.from(groups.entries()).map(([group, rows]) => ({
      group,
      rows: rows.sort((a, b) => a.person_name.localeCompare(b.person_name)),
    }));
  }, [payrollMetrics?.summary, rosterById]);

  return (
    <section style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">People</p>
            <h1>Payroll</h1>
            <p className="muted">
              Attendance review for payroll aide. V1 shows who had shift presence signals during the selected work week.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-grid",
                gap: 4,
                minWidth: 260,
              }}
            >
              <span className="context-stat__label">Week Scope</span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px minmax(150px, 1fr) 72px",
                  alignItems: "center",
                  border: "1px solid #d7e2ee",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#f8fafc",
                }}
              >
                <button
                  className="button"
                  type="button"
                  onClick={() => setWeekEnd(addDays(weekEnd, -7))}
                  style={{ border: 0, borderRadius: 0, boxShadow: "none" }}
                >
                  Prev
                </button>
                <strong
                  style={{
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 13,
                    padding: "0 16px",
                    whiteSpace: "nowrap",
                    borderLeft: "1px solid #e6edf5",
                    borderRight: "1px solid #e6edf5",
                    minHeight: 42,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {weekRangeLabel(weekEnd)}
                </strong>
                <button
                  className="button"
                  type="button"
                  onClick={() => setWeekEnd(addDays(weekEnd, 7))}
                  style={{ border: 0, borderRadius: 0, boxShadow: "none" }}
                >
                  Next
                </button>
              </div>
            </div>
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
          <span>Week Ending Friday: {weekEnd}</span>
          <span>
            {payrollMetrics?.record_count ?? attendanceRows.length} records · Estimated payroll{" "}
            {money(payrollMetrics?.estimated_payroll)} · Estimated threshold pay{" "}
            {money(payrollMetrics?.estimated_threshold_pay)}
          </span>
          {payrollView === "attendance" ? (
            <span>✓ Present · C Call-out · N No Show · — No signal</span>
          ) : (
            <ReportDayPills days={days} activity={payrollMetrics?.activity ?? []} />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["attendance", "summary", "detail"] as const).map((view) => (
            <button
              key={view}
              type="button"
              className={payrollView === view ? "button button-primary" : "button"}
              onClick={() => setPayrollView(view)}
            >
              {view === "attendance" ? "Attendance" : view === "summary" ? "Summary" : "Detail"}
            </button>
          ))}
        </div>

        {error ? (
          <div style={{ color: "#991b1b", fontWeight: 800 }}>{error}</div>
        ) : null}

        {loading ? (
          <div className="muted">Loading attendance...</div>
        ) : payrollView === "summary" ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Employee</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Days Worked</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Base Pay</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Threshold Pay</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total Earnings</th>
                </tr>
              </thead>
              <tbody>
                {groupedSummaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                      No payroll activity found for this week.
                    </td>
                  </tr>
                ) : (
                  groupedSummaryRows.flatMap(({ group, rows }) => [
                    <tr key={`group-${group}`}>
                      <td
                        colSpan={5}
                        style={{
                          ...tdStyle,
                          background: "#f8fafc",
                          color: "#64748b",
                          fontSize: 11,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {group}
                      </td>
                    </tr>,
                    ...rows.map((row) => (
                      <tr key={`${group}-${row.roster_member_id ?? row.person_name}`}>
                        <td style={tdStyle}>
                          <strong>{row.person_name}</strong>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{workedDaysLabel(row.days_worked, row.worked_days)}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{money(row.daily_pay_total)}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{money(row.threshold_pay_total)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{money(row.estimated_total)}</td>
                      </tr>
                    )),
                  ])
                )}
              </tbody>
            </table>
          </div>
        ) : payrollView === "detail" ? (
          <div className="muted" style={{ fontWeight: 800 }}>
            Detail view is next: WA, stops, threshold overage, and source evidence by day.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Employee</th>
                  <th style={thStyle}>Type</th>
                  {days.map((day) => (
                    <th key={day} style={{ ...thStyle, textAlign: "center" }}>
                      {dayLabel(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                      No attendance signals found for this week.
                    </td>
                  </tr>
                ) : (
                  attendanceRows.map((row) => (
                    <tr key={row.roster_member_id}>
                      <td style={tdStyle}>
                        <strong>{row.full_name}</strong>
                      </td>
                      <td style={tdStyle}>{row.worker_type ?? "—"}</td>
                      {days.map((day) => {
                        const cell = row.days[day] ?? emptyCell();
                        const display = cellDisplay(cell);

                        return (
                          <td key={day} style={{ ...tdStyle, textAlign: "center" }}>
                            <div
                              title={display.title}
                              style={{
                                display: "inline-grid",
                                justifyItems: "center",
                                gap: 3,
                                minWidth: cell.details.length > 0 ? 72 : 28,
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 28,
                                  height: 28,
                                  borderRadius: 999,
                                  border: `1px solid ${display.border}`,
                                  background: display.bg,
                                  color: display.tone,
                                  fontWeight: 950,
                                }}
                              >
                                {display.label}
                              </span>
                              {cell.details.length > 0 ? (
                                <span
                                  style={{
                                    display: "grid",
                                    gap: 1,
                                    color: "#475569",
                                    fontSize: 10,
                                    fontWeight: 850,
                                    lineHeight: 1.1,
                                  }}
                                >
                                  {cell.details.slice(0, 3).map((detail) => (
                                    <span key={detail}>{detail}</span>
                                  ))}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

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
