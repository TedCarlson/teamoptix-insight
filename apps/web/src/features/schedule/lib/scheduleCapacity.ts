import {
  classifyDriverProgram,
  type DriverProgram,
} from "@/features/people/lib/driverWorkforceType";

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
  employment_status?: string | null;
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
  routeCoveragePercent: number;
  coveredRoutesByProgram: Record<DriverProgram, number>;
  seams: ScheduleCoverageSeam[];
};

export type ScheduleCoverageSeamType =
  | "UNCOVERED_ROUTE"
  | "DUPLICATE_ROUTE_ASSIGNMENT"
  | "UNMATCHED_ROUTE_ASSIGNMENT"
  | "NON_DRIVER_ROUTE_ASSIGNMENT";

export type ScheduleCoverageSeam = {
  type: ScheduleCoverageSeamType;
  routeLabel: string;
  rosterMemberIds: string[];
  detail: string;
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

export function isTraineeWorker(
  workerType: string | null,
  employmentStatus?: string | null
) {
  const normalizedStatus = String(employmentStatus ?? "").trim().toLowerCase();
  const normalizedWorkerType = String(workerType ?? "").trim().toLowerCase();

  return normalizedStatus === "trainee" || normalizedWorkerType.includes("trainee");
}

export function isDriverSeatWorker(
  workerType: string | null,
  employmentStatus?: string | null
) {
  return classifyDriverProgram(workerType) != null &&
    !isTraineeWorker(workerType, employmentStatus);
}

export function resolveBaselineScheduledOffDrivers<
  T extends ScheduleCapacityPerson,
>(scheduleRows: T[]) {
  return scheduleRows.filter(
    (row) =>
      !row.planned_on &&
      !row.override_type &&
      isDriverSeatWorker(row.worker_type, row.employment_status)
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
    (row) =>
      row.planned_on &&
      isDriverSeatWorker(row.worker_type, row.employment_status)
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

  const coveredRoutesByProgram: Record<DriverProgram, number> = {
    STANDARD: 0,
    AVP: 0,
  };
  const seams: ScheduleCoverageSeam[] = [];

  for (const route of demandedRoutes) {
    const aliases = routeAliases(route);
    const assignments = assignedDrivers.filter((row) =>
      aliases.has(normalizeRouteKey(row.route_name))
    );

    if (!assignments.length) {
      seams.push({
        type: "UNCOVERED_ROUTE",
        routeLabel: scheduleRouteLabel(route),
        rosterMemberIds: [],
        detail: "A running route has no scheduled driver assignment.",
      });
      continue;
    }

    const coverageProgram = classifyDriverProgram(assignments[0].worker_type);
    if (coverageProgram) coveredRoutesByProgram[coverageProgram] += 1;

    if (assignments.length > 1) {
      seams.push({
        type: "DUPLICATE_ROUTE_ASSIGNMENT",
        routeLabel: scheduleRouteLabel(route),
        rosterMemberIds: assignments.map((row) => row.roster_member_id),
        detail: `${assignments.length} scheduled drivers point to the same running route.`,
      });
    }
  }

  for (const row of assignedDrivers) {
    const routeKey = normalizeRouteKey(row.route_name);
    const matchesDemand = demandedRoutes.some((route) =>
      routeAliases(route).has(routeKey)
    );
    if (!matchesDemand) {
      seams.push({
        type: "UNMATCHED_ROUTE_ASSIGNMENT",
        routeLabel: row.route_name?.trim() || "Unnamed route",
        rosterMemberIds: [row.roster_member_id],
        detail: "A scheduled driver points to a route that is not running in the route baseline.",
      });
    }
  }

  for (const row of scheduleRows) {
    if (
      !row.planned_on ||
      !normalizeRouteKey(row.route_name) ||
      isDriverSeatWorker(row.worker_type, row.employment_status)
    ) continue;

    seams.push({
      type: "NON_DRIVER_ROUTE_ASSIGNMENT",
      routeLabel: row.route_name?.trim() || "Unnamed route",
      rosterMemberIds: [row.roster_member_id],
      detail: isTraineeWorker(row.worker_type, row.employment_status)
        ? "A trainee is assigned to a route but does not independently cover it."
        : "A non-driver role is assigned to a route and does not count as route coverage.",
    });
  }

  return {
    scheduledDrivers: scheduledDrivers.length,
    routeDemand: demandedRoutes.length,
    assignedDrivers: assignedDrivers.length,
    assignedRoutes: assignedRoutes.length,
    openRoutes,
    standbyDrivers,
    capacityDelta: scheduledDrivers.length - demandedRoutes.length,
    routeCoveragePercent: demandedRoutes.length
      ? (assignedRoutes.length / demandedRoutes.length) * 100
      : 100,
    coveredRoutesByProgram,
    seams,
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

export type ScheduleCapacitySignal = {
  label: string;
  background: string;
  border: string;
  color: string;
};

export function scheduleCapacitySignal(
  delta: number,
  workforce: number,
  routeDemand: number
): ScheduleCapacitySignal {
  if (workforce === 0 && routeDemand === 0) {
    return {
      label: "No operation",
      background: "#f1f5f9",
      border: "#cbd5e1",
      color: "#64748b",
    };
  }

  if (delta < 0) {
    return {
      label: "Service risk",
      background: "#fee2e2",
      border: "#fca5a5",
      color: "#b91c1c",
    };
  }

  if (delta === 0) {
    return {
      label: "No contingency",
      background: "#fef3c7",
      border: "#fcd34d",
      color: "#92400e",
    };
  }

  if (delta <= 2) {
    return {
      label: "Target range",
      background: "#dcfce7",
      border: "#86efac",
      color: "#166534",
    };
  }

  if (delta <= 5) {
    return {
      label: "Labor high",
      background: "#fef3c7",
      border: "#fcd34d",
      color: "#92400e",
    };
  }

  return {
    label: "Profitability risk",
    background: "#fee2e2",
    border: "#fca5a5",
    color: "#b91c1c",
  };
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
  | "HOLIDAY"
  | "ADD_IN"
  | "RESIGNATION_NOTICE";

export function resolveScheduleOverrideImpact(params: {
  requestedDates: string[];
  rosterMemberId: string;
  overrideType: ScheduleOverrideImpactType;
  routes: ScheduleCapacityRoute[];
  scheduleRows: TimeOffImpactScheduleRow[];
  worker: {
    full_name: string | null;
    worker_type: string | null;
    employment_status?: string | null;
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
            employment_status: worker.employment_status,
            planned_on: true,
            route_name: null,
          },
        ];
      }
    } else if (currentWorkerRow?.planned_on) {
      projectedRows = rowsForDate.filter(
        (row) => row.roster_member_id !== rosterMemberId
      );
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
      affectsSchedule:
        projected.scheduledDrivers !== current.scheduledDrivers,
      signalLabel: scheduleCapacitySignalLabel(projected.capacityDelta),
    };
  });

  return {
    days,
    affectedDayCount: days.filter((day) => day.affectsSchedule).length,
    unchangedDayCount: days.filter((day) => !day.affectsSchedule).length,
  };
}
