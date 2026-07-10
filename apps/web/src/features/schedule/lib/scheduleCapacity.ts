export type ScheduleCapacityRoute = {
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

export type ScheduleCapacityPerson = {
  id?: string;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  planned_on: boolean;
  route_name: string | null;
};

export type DailyScheduleCapacity = {
  scheduledDrivers: number;
  routeDemand: number;
  assignedDrivers: number;
  assignedRoutes: number;
  openRoutes: ScheduleCapacityRoute[];
  standbyDrivers: ScheduleCapacityPerson[];
  capacityDelta: number;
};

type RouteRunFlag =
  | "runs_s"
  | "runs_u"
  | "runs_m"
  | "runs_t"
  | "runs_w"
  | "runs_h"
  | "runs_f";

export function scheduleRunFlagForDate(serviceDate: string): RouteRunFlag {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  if (weekday === 6) return "runs_s";
  if (weekday === 0) return "runs_u";
  if (weekday === 1) return "runs_m";
  if (weekday === 2) return "runs_t";
  if (weekday === 3) return "runs_w";
  if (weekday === 4) return "runs_h";
  return "runs_f";
}

function normalizeRouteKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function routeAliases(route: ScheduleCapacityRoute) {
  return new Set(
    [route.current_wa_num, route.route_name]
      .map(normalizeRouteKey)
      .filter(Boolean)
  );
}

function isDriverSeatWorker(workerType: string | null) {
  const normalized = String(workerType ?? "").trim().toLowerCase();

  return !normalized.includes("helper") &&
    !normalized.includes("jumper") &&
    !normalized.includes("trainee");
}

export function resolveDailyScheduleCapacity(params: {
  serviceDate: string;
  routes: ScheduleCapacityRoute[];
  scheduleRows: ScheduleCapacityPerson[];
}): DailyScheduleCapacity {
  const { serviceDate, routes, scheduleRows } = params;
  const runFlag = scheduleRunFlagForDate(serviceDate);

  const demandedRoutes = routes.filter((route) => route[runFlag] === true);

  const scheduledDrivers = scheduleRows.filter(
    (row) => row.planned_on && isDriverSeatWorker(row.worker_type)
  );

  const assignedDrivers = scheduledDrivers.filter((row) =>
    Boolean(normalizeRouteKey(row.route_name))
  );

  const assignedRouteKeys = new Set(
    assignedDrivers
      .map((row) => normalizeRouteKey(row.route_name))
      .filter(Boolean)
  );

  const assignedRoutes = demandedRoutes.filter((route) =>
    Array.from(routeAliases(route)).some((alias) =>
      assignedRouteKeys.has(alias)
    )
  );

  const openRoutes = demandedRoutes.filter(
    (route) =>
      !Array.from(routeAliases(route)).some((alias) =>
        assignedRouteKeys.has(alias)
      )
  );

  const standbyDrivers = scheduledDrivers.filter(
    (row) => !normalizeRouteKey(row.route_name)
  );

  return {
    scheduledDrivers: scheduledDrivers.length,
    routeDemand: demandedRoutes.length,
    assignedDrivers: assignedDrivers.length,
    assignedRoutes: assignedRoutes.length,
    openRoutes,
    standbyDrivers,
    capacityDelta: scheduledDrivers.length - demandedRoutes.length,
  };
}

export function scheduleRouteLabel(route: ScheduleCapacityRoute) {
  const wa = String(route.current_wa_num ?? "").trim();
  const name = String(route.route_name ?? "").trim();

  if (wa && name) return `${wa} · ${name}`;
  return wa || name || "Unnamed route";
}
