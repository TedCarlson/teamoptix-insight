export type ManagerScheduleRoute = {
  id: string;
  route_name: string | null;
  current_wa_num: string | null;
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
};

export type ManagerScheduleRow = {
  service_date: string;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  planned_on: boolean;
  route_name: string | null;
  override_type: string | null;
};

export type ManagerTimeOffRequest = {
  id: string;
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  requested_dates: string[];
  start_date: string;
  end_date: string;
  day_count: number;
  status: "PENDING" | "APPROVED" | "DENIED" | "WITHDRAWN";
  request_note: string | null;
  manager_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

export type ManagerScheduleOverride = {
  id: string;
  roster_member_id: string;
  full_name: string;
  override_type: string;
  start_date: string;
  end_date: string;
  route_name_override: string | null;
  manager_note: string | null;
};

export type ManagerCoverageStatus = "COVERED" | "TIGHT" | "GAP";

export type ManagerScheduleDay = {
  serviceDate: string;
  scheduledDrivers: number;
  routeDemand: number;
  assignedDrivers: number;
  openRoutes: ManagerScheduleRoute[];
  standbyDrivers: ManagerScheduleRow[];
  capacityDelta: number;
  status: ManagerCoverageStatus;
};

export type ManagerScheduleSnapshot = {
  weekStart: string;
  weekEnd: string;
  days: ManagerScheduleDay[];
  pendingRequests: ManagerTimeOffRequest[];
  activeOverrides: ManagerScheduleOverride[];
  generatedAt: string;
};

type RouteRunFlag =
  | "runs_s"
  | "runs_u"
  | "runs_m"
  | "runs_t"
  | "runs_w"
  | "runs_h"
  | "runs_f";

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addScheduleDays(value: string, amount: number) {
  const next = dateFromIso(value);
  next.setDate(next.getDate() + amount);
  return isoDate(next);
}

export function managerWeekStart(value = new Date()) {
  const next = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const daysSinceSaturday = (next.getDay() + 1) % 7;
  next.setDate(next.getDate() - daysSinceSaturday);
  return isoDate(next);
}

export function scheduleRunFlagForDate(serviceDate: string): RouteRunFlag {
  const weekday = dateFromIso(serviceDate).getDay();
  if (weekday === 6) return "runs_s";
  if (weekday === 0) return "runs_u";
  if (weekday === 1) return "runs_m";
  if (weekday === 2) return "runs_t";
  if (weekday === 3) return "runs_w";
  if (weekday === 4) return "runs_h";
  return "runs_f";
}

export function isDriverSeatWorker(workerType: string | null) {
  const normalized = String(workerType ?? "").trim().toLowerCase();
  return !normalized.includes("helper")
    && !normalized.includes("jumper")
    && !normalized.includes("trainee");
}

function normalizeRoute(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function routeAliases(route: ManagerScheduleRoute) {
  return [route.route_name, route.current_wa_num].map(normalizeRoute).filter(Boolean);
}

export function coverageStatus(delta: number): ManagerCoverageStatus {
  if (delta < 0) return "GAP";
  if (delta === 0) return "TIGHT";
  return "COVERED";
}

export function resolveManagerScheduleDay(params: {
  serviceDate: string;
  routes: ManagerScheduleRoute[];
  rows: ManagerScheduleRow[];
}): ManagerScheduleDay {
  const demandedRoutes = params.routes.filter(
    (route) => route[scheduleRunFlagForDate(params.serviceDate)] === true,
  );
  const scheduledDrivers = params.rows.filter(
    (row) => row.planned_on && isDriverSeatWorker(row.worker_type),
  );
  const assignedDrivers = scheduledDrivers.filter((row) => Boolean(normalizeRoute(row.route_name)));
  const assignedRouteNames = new Set(assignedDrivers.map((row) => normalizeRoute(row.route_name)));
  const openRoutes = demandedRoutes.filter(
    (route) => !routeAliases(route).some((alias) => assignedRouteNames.has(alias)),
  );
  const standbyDrivers = scheduledDrivers.filter((row) => !normalizeRoute(row.route_name));
  const capacityDelta = scheduledDrivers.length - demandedRoutes.length;

  return {
    serviceDate: params.serviceDate,
    scheduledDrivers: scheduledDrivers.length,
    routeDemand: demandedRoutes.length,
    assignedDrivers: assignedDrivers.length,
    openRoutes,
    standbyDrivers,
    capacityDelta,
    status: coverageStatus(capacityDelta),
  };
}

export function buildManagerScheduleSnapshot(params: {
  weekStart: string;
  routes: ManagerScheduleRoute[];
  rows: ManagerScheduleRow[];
  requests: ManagerTimeOffRequest[];
  overrides: ManagerScheduleOverride[];
}): ManagerScheduleSnapshot {
  const days = Array.from({ length: 7 }, (_, index) => {
    const serviceDate = addScheduleDays(params.weekStart, index);
    return resolveManagerScheduleDay({
      serviceDate,
      routes: params.routes,
      rows: params.rows.filter((row) => row.service_date === serviceDate),
    });
  });
  return {
    weekStart: params.weekStart,
    weekEnd: addScheduleDays(params.weekStart, 6),
    days,
    pendingRequests: params.requests.filter((request) => request.status === "PENDING"),
    activeOverrides: params.overrides,
    generatedAt: new Date().toISOString(),
  };
}
