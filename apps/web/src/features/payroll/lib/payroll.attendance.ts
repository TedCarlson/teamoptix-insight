import { getReversedDispatchEventIds, type DispatchEventRow } from "@/features/dispatch/lib/dispatchSupport";
import type { RosterRow } from "@/features/people/types/roster.types";
import type { AttendanceCell, AttendanceRow, PayrollActivityRow } from "@/features/payroll/lib/payroll.types";

export function emptyCell(): AttendanceCell {
  return { present: false, callout: false, noShow: false, sources: [], details: [], adjustmentAmount: 0, adjustmentLabels: [] };
}

export function addSource(cell: AttendanceCell, source: string) {
  if (!cell.sources.includes(source)) cell.sources.push(source);
}

export function addDetail(cell: AttendanceCell, detail: string | null | undefined) {
  if (!detail) return;
  if (!cell.details.includes(detail)) cell.details.push(detail);
}

export function presentEventCode(code: string) {
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

function isDswPayrollSource(sourceKind: string | null | undefined) {
  return sourceKind === "DSW_ACTUAL" || sourceKind === "DSW_OWNERSHIP";
}

export function cellDisplay(cell: AttendanceCell) {
  if (cell.callout) return { label: "C", title: "Call-out", tone: "#92400e", bg: "#fffbeb", border: "#fde68a" };
  if (cell.noShow) return { label: "N", title: "No show", tone: "#991b1b", bg: "#fef2f2", border: "#fecaca" };
  if (cell.present) {
    const detailText = cell.details.length > 0 ? ` · ${cell.details.join(" · ")}` : "";
    return { label: "✓", title: `Present · ${cell.sources.join(", ")}${detailText}`, tone: "#166534", bg: "#ecfdf5", border: "#bbf7d0" };
  }
  return { label: "—", title: "No attendance signal", tone: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0" };
}

export function buildAttendanceRows({
  roster,
  days,
  eventsByDay,
  payrollActivity,
}: {
  roster: RosterRow[];
  days: string[];
  eventsByDay: Record<string, DispatchEventRow[]>;
  payrollActivity: PayrollActivityRow[];
}): AttendanceRow[] {
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

  for (const activity of payrollActivity) {
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
    addSource(cell, isDswPayrollSource(activity.source_kind) ? "DSW" : "PAYROLL");

    if (isDswPayrollSource(activity.source_kind)) {
      addDetail(cell, activity.wa_number ? `WA ${activity.wa_number}` : null);
    }

    row.days[activity.service_date] = cell;
  }

  return Array.from(rows.values()).filter((row) =>
    Object.values(row.days).some((cell) => cell.present || cell.callout || cell.noShow)
  );
}
