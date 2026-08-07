import type React from "react";

export type GeneratedScheduleRow = {
  id: string;
  service_date: string;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  planned_on: boolean;
  route_name: string | null;
  source_kind: string;
  override_type: string | null;
};

export type RouteRow = {
  id: string;
  route_name: string | null;
  current_wa_num: string | null;
  route_location: string | null;
  route_type: string | null;
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
};

export type Seat = "driver" | "helper" | "trainee";

export type DispatchPerson = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  source_kind: string;
  override_type: string | null;
};

export type DispatchRosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: string | null;
};

export type DispatchRoute = {
  route_key: string;
  route_name: string;
  current_wa_num: string | null;
  route_location: string | null;
  route_type: string | null;
  driver: DispatchPerson | null;
  helpers: DispatchPerson[];
  trainees: DispatchPerson[];
  extras: DispatchPerson[];
};

export type AssignmentIntent = {
  route_key: string;
  route_label: string;
  seat: Seat;
} | null;

export function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function runFlagForDate(serviceDate: string) {
  const [year, month, dayOfMonth] = serviceDate.split("-").map(Number);
  const day = new Date(year, month - 1, dayOfMonth).getDay();
  if (day === 6) return "runs_s";
  if (day === 0) return "runs_u";
  if (day === 1) return "runs_m";
  if (day === 2) return "runs_t";
  if (day === 3) return "runs_w";
  if (day === 4) return "runs_h";
  return "runs_f";
}

export function todayRunFlag() {
  return runFlagForDate(todayIso());
}

export function cleanRouteKey(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "UNASSIGNED";
}

export function classifyPerson(row: GeneratedScheduleRow): Seat {
  const worker = (row.worker_type ?? "").toLowerCase();
  const name = (row.full_name ?? "").toLowerCase();
  const combined = `${worker} ${name}`;

  if (combined.includes("trainee")) return "trainee";
  if (combined.includes("helper") || combined.includes("jumper")) return "helper";
  return "driver";
}

export function personFromRow(row: GeneratedScheduleRow): DispatchPerson {
  return {
    roster_member_id: row.roster_member_id,
    full_name: row.full_name?.trim() || "Unnamed worker",
    worker_type: row.worker_type,
    source_kind: row.source_kind,
    override_type: row.override_type,
  };
}

export function routeLabel(route: DispatchRoute) {
  if (route.current_wa_num && route.route_name) {
    return `${route.current_wa_num} · ${route.route_name}`;
  }
  return route.current_wa_num || route.route_name;
}

export function personSort(a: DispatchPerson, b: DispatchPerson) {
  return a.full_name.localeCompare(b.full_name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function personTypeLabel(person: DispatchPerson) {
  return person.worker_type || "Worker";
}

export const shell: React.CSSProperties = {
  width: "min(1600px, calc(100% - 20px))",
  margin: "0 auto",
  padding: "12px 0 24px",
  display: "grid",
  gap: 10,
};

export const panel: React.CSSProperties = {
  border: "1px solid #d6dfeb",
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
};

export const panelHeader: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e6edf5",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  columnGap: 12,
  rowGap: 0,
};

export const eyebrow: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const compactButton: React.CSSProperties = {
  minHeight: 32,
  padding: "0 10px",
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#d6dfeb",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
};

export const selectedButton: React.CSSProperties = {
  ...compactButton,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

export const routeRowBase: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px minmax(175px, 0.62fr) minmax(170px, 0.68fr) minmax(470px, 2fr)",
  gap: 8,
  alignItems: "center",
  padding: "8px 10px",
  borderBottom: "1px solid #eef2f7",
};

export const seatButtonBase: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid #dbe4ef",
  background: "#fff",
  textAlign: "left",
  fontWeight: 800,
  color: "#0f172a",
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export type DispatchDayRow = {
  id: string;
  company_id: string;
  dispatch_date: string;
  status: "ACTIVE" | "LOCKED" | string;
  locked_at: string | null;
  locked_by_profile_id: string | null;
  snapshot_json: unknown;
};

export type DispatchEventRow = {
  id: string;
  event_code: string;
  event_label: string;
  event_category: string;
  route_key: string | null;
  route_label: string | null;
  from_route_key: string | null;
  from_route_label: string | null;
  to_route_key: string | null;
  to_route_label: string | null;
  seat: string | null;
  person_roster_member_id: string | null;
  person_name: string | null;
  note: string | null;
  event_payload?: Record<string, unknown> | null;
  created_at: string;
};

export type DispatchEventTypeRow = {
  id: string;
  event_code: string;
  event_label: string;
  event_category: string;
  source: "system" | "company" | string;
  entry_mode: "auto" | "manual" | "both" | string;
  requires_person: boolean;
  requires_route: boolean;
  requires_assignment: boolean;
  allows_note: boolean;
  requires_note: boolean;
  sort_order: number;
};


export function isUndoableDispatchEvent(event: DispatchEventRow) {
  if (event.event_code.startsWith("UNDO_")) return false;

  const payload = event.event_payload ?? {};
  if (typeof payload.reverses_event_id === "string") return false;

  return true;
}

export function getReversedDispatchEventIds(events: DispatchEventRow[]) {
  const ids = new Set<string>();

  for (const event of events) {
    const reversesEventId = event.event_payload?.reverses_event_id;

    if (typeof reversesEventId === "string" && reversesEventId.trim()) {
      ids.add(reversesEventId);
    }
  }

  return ids;
}
