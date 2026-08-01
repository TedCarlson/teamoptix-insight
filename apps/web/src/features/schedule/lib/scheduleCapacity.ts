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
  id?: string | null;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  planned_on: boolean;
  route_name: string | null;
  override_type?: string | null;
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

export function isDriverSeatWorker(workerType: string | null) {
  const normalized = String(workerType ?? "").trim().toLowerCase();

  return !normalized.includes("helper") &&
    !normalized.includes("jumper") &&
    !normalized.includes("trainee");
}

export function resolveBaselineScheduledOffDrivers<
  T extends ScheduleCapacityPerson,
>(scheduleRows: T[]) {
  return scheduleRows.filter(
    (row) =>
      !row.planned_on &&
      !row.override_type &&
      isDriverSeatWorker(row.worker_type)
  );
}

export function resolveOverrideOffRows<T extends ScheduleCapacityPerson>(
  scheduleRows: T[]
) {
  return scheduleRows.filter(
    (row) => !row.planned_on && Boolean(row.override_type)
  );
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

export type TimeOffImpactScheduleRow = ScheduleCapacityPerson & {
  service_date: string;
};

export type TimeOffImpactDay = {
  serviceDate: string;
  routeDemand: number;
  currentScheduledDrivers: number;
  projectedScheduledDrivers: number;
  currentDelta: number;
  projectedDelta: number;
  affectsSchedule: boolean;
  signalLabel: string;
};

export type TimeOffRequestImpact = {
  days: TimeOffImpactDay[];
  affectedDayCount: number;
  unchangedDayCount: number;
};

export function scheduleCapacitySignalLabel(delta: number) {
  if (delta < 0) return "Service risk";
  if (delta === 0) return "No contingency";
  if (delta <= 2) return "Target range";
  if (delta <= 5) return "Labor high";
  return "Profitability risk";
}

export function resolveTimeOffRequestImpact(params: {
  requestedDates: string[];
  rosterMemberId: string;
  routes: ScheduleCapacityRoute[];
  scheduleRows: TimeOffImpactScheduleRow[];
}): TimeOffRequestImpact {
  const {
    requestedDates,
    rosterMemberId,
    routes,
    scheduleRows,
  } = params;

  const days = requestedDates.map((serviceDate) => {
    const rowsForDate = scheduleRows.filter(
      (row) => row.service_date === serviceDate
    );

    const current = resolveDailyScheduleCapacity({
      serviceDate,
      routes,
      scheduleRows: rowsForDate,
    });

    const projectedRows = rowsForDate.filter(
      (row) =>
        !(
          row.roster_member_id === rosterMemberId &&
          row.planned_on
        )
    );

    const projected = resolveDailyScheduleCapacity({
      serviceDate,
      routes,
      scheduleRows: projectedRows,
    });

    const affectsSchedule =
      projected.scheduledDrivers !== current.scheduledDrivers;

    return {
      serviceDate,
      routeDemand: current.routeDemand,
      currentScheduledDrivers: current.scheduledDrivers,
      projectedScheduledDrivers: projected.scheduledDrivers,
      currentDelta: current.capacityDelta,
      projectedDelta: projected.capacityDelta,
      affectsSchedule,
      signalLabel: scheduleCapacitySignalLabel(projected.capacityDelta),
    };
  });

  return {
    days,
    affectedDayCount: days.filter((day) => day.affectsSchedule).length,
    unchangedDayCount: days.filter((day) => !day.affectsSchedule).length,
  };
}

export type ScheduleOverrideImpactType =
  | "TIME_OFF"
  | "CALL_OUT"
  | "ADMIN_OFF"
  | "ADD_IN";

export function resolveScheduleOverrideImpact(params: {
  requestedDates: string[];
  rosterMemberId: string;
  overrideType: ScheduleOverrideImpactType;
  routes: ScheduleCapacityRoute[];
  scheduleRows: TimeOffImpactScheduleRow[];
  worker: {
    full_name: string | null;
    worker_type: string | null;
  };
}): TimeOffRequestImpact {
  const {
    requestedDates,
    rosterMemberId,
    overrideType,
    routes,
    scheduleRows,
    worker,
  } = params;

  const days = requestedDates.map((serviceDate) => {
    const rowsForDate = scheduleRows.filter(
      (row) => row.service_date === serviceDate
    );

    const current = resolveDailyScheduleCapacity({
      serviceDate,
      routes,
      scheduleRows: rowsForDate,
    });

    const currentWorkerRow =
      rowsForDate.find(
        (row) => row.roster_member_id === rosterMemberId
      ) ?? null;

    let projectedRows = rowsForDate;
    let affectsSchedule = false;

    if (overrideType === "ADD_IN") {
      if (!currentWorkerRow?.planned_on) {
        projectedRows = [
          ...rowsForDate,
          {
            id: `draft-add-in:${serviceDate}:${rosterMemberId}`,
            service_date: serviceDate,
            roster_member_id: rosterMemberId,
            full_name: worker.full_name,
            worker_type: worker.worker_type,
            planned_on: true,
            route_name: null,
          },
        ];

        affectsSchedule = true;
      }
    } else if (currentWorkerRow?.planned_on) {
      projectedRows = rowsForDate.filter(
        (row) => row.roster_member_id !== rosterMemberId
      );

      affectsSchedule = true;
    }

    const projected = resolveDailyScheduleCapacity({
      serviceDate,
      routes,
      scheduleRows: projectedRows,
    });

    return {
      serviceDate,
      routeDemand: current.routeDemand,
      currentScheduledDrivers: current.scheduledDrivers,
      projectedScheduledDrivers: projected.scheduledDrivers,
      currentDelta: current.capacityDelta,
      projectedDelta: projected.capacityDelta,
      affectsSchedule,
      signalLabel: scheduleCapacitySignalLabel(projected.capacityDelta),
    };
  });

  return {
    days,
    affectedDayCount: days.filter((day) => day.affectsSchedule).length,
    unchangedDayCount: days.filter((day) => !day.affectsSchedule).length,
  };
}
