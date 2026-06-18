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
};

type AttendanceRow = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  days: Record<string, AttendanceCell>;
};

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

function weekDaysForEnd(weekEnd: string) {
  const start = addDays(weekEnd, -6);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function dayLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

function emptyCell(): AttendanceCell {
  return { present: false, callout: false, noShow: false, sources: [] };
}

function addSource(cell: AttendanceCell, source: string) {
  if (!cell.sources.includes(source)) cell.sources.push(source);
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
  if (cell.present) return { label: "✓", title: `Present · ${cell.sources.join(", ")}`, tone: "#166534", bg: "#ecfdf5", border: "#bbf7d0" };
  return { label: "—", title: "No attendance signal", tone: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0" };
}

export default function PayrollAttendanceGrid() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [weekEnd, setWeekEnd] = useState(currentWeekEndFriday);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [eventsByDay, setEventsByDay] = useState<Record<string, DispatchEventRow[]>>({});
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

        const dispatchPayloads = await Promise.all(
          days.map(async (day) => {
            const res = await fetch(`/api/company/${slug}/dispatch/day?date=${day}`, {
              credentials: "include",
              cache: "no-store",
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? `Failed to load dispatch day ${day}.`);

            return [day, (data?.events ?? []) as DispatchEventRow[]] as const;
          })
        );

        if (!active) return;

        setRoster((rosterData?.roster ?? []) as RosterRow[]);
        setEventsByDay(Object.fromEntries(dispatchPayloads));
      } catch (err) {
        if (!active) return;
        setRoster([]);
        setEventsByDay({});
        setError(err instanceof Error ? err.message : "Failed to load payroll attendance.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void load();

    return () => {
      active = false;
    };
  }, [slug, days]);

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

    return Array.from(rows.values()).filter((row) =>
      Object.values(row.days).some((cell) => cell.present || cell.callout || cell.noShow)
    );
  }, [days, eventsByDay, roster]);

  const presentCount = attendanceRows.reduce(
    (sum, row) => sum + Object.values(row.days).filter((cell) => cell.present).length,
    0
  );

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
            <button className="button" type="button" onClick={() => setWeekEnd(addDays(weekEnd, -7))}>
              Previous Week
            </button>
            <button className="button" type="button" onClick={() => setWeekEnd(currentWeekEndFriday())}>
              This Week
            </button>
            <button className="button" type="button" onClick={() => setWeekEnd(addDays(weekEnd, 7))}>
              Next Week
            </button>
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
          <span>{attendanceRows.length} people with signals · {presentCount} present-day signals</span>
          <span>✓ Present · C Call-out · N No Show · — No signal</span>
        </div>

        {error ? (
          <div style={{ color: "#991b1b", fontWeight: 800 }}>{error}</div>
        ) : null}

        {loading ? (
          <div className="muted">Loading attendance...</div>
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
                            <span
                              title={display.title}
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
