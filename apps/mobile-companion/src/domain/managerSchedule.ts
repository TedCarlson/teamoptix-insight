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
  employment_status: string | null;
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

export type ManagerSchedulePreset = {
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

export type ManagerScheduleBaseline = {
  id: string;
  roster_member_id: string;
  preset_id: string | null;
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
};

export type ManagerScheduleRosterMember = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: string | null;
};

export type ManagerScheduleWorkbenchRow = {
  rosterMemberId: string;
  fullName: string;
  workerType: string | null;
  employmentStatus: string | null;
  baselineId: string | null;
  presetId: string | null;
  presetCode: string | null;
  rotationMode: string | null;
  anchorDate: string | null;
  effectiveStart: string | null;
  defaultRoutes: string[];
  baseline: ManagerScheduleBaseline | null;
  schedulePending: boolean;
};

export type ManagerCapacitySignal =
  | "NO_OPERATION"
  | "SERVICE_RISK"
  | "NO_CONTINGENCY"
  | "TARGET_RANGE"
  | "LABOR_HIGH"
  | "PROFITABILITY_RISK";

export type ManagerScheduleDay = {
  serviceDate: string;
  scheduledDrivers: number;
  routeDemand: number;
  assignedDrivers: number;
  assignedRoutes: number;
  openRoutes: ManagerScheduleRoute[];
  standbyDrivers: ManagerScheduleRow[];
  baselineScheduledOffDrivers: ManagerScheduleRow[];
  overrideOffRows: ManagerScheduleRow[];
  traineeRows: ManagerScheduleRow[];
  capacityDelta: number;
  signal: ManagerCapacitySignal;
};

export type ManagerScheduleSnapshot = {
  weekStart: string;
  weekEnd: string;
  days: ManagerScheduleDay[];
  pendingRequests: ManagerTimeOffRequest[];
  activeOverrides: ManagerScheduleOverride[];
  workbenchRows: ManagerScheduleWorkbenchRow[];
  presets: ManagerSchedulePreset[];
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

export function managerCalendarStart(value = new Date()) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1, 12);
  return managerWeekStart(first);
}

export function addScheduleMonths(value: string, amount: number) {
  const current = dateFromIso(value);
  current.setDate(15);
  current.setMonth(current.getMonth() + amount);
  return managerCalendarStart(current);
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

export function isTraineeWorker(
  workerType: string | null,
  employmentStatus: string | null = null,
) {
  const normalizedWorkerType = String(workerType ?? "").trim().toLowerCase();
  const normalizedEmploymentStatus = String(employmentStatus ?? "").trim().toLowerCase();
  return normalizedEmploymentStatus === "trainee"
    || normalizedWorkerType.includes("trainee");
}

export function isDriverSeatWorker(
  workerType: string | null,
  employmentStatus: string | null = null,
) {
  const normalized = String(workerType ?? "").trim().toLowerCase();
  return !normalized.includes("helper")
    && !normalized.includes("jumper")
    && !isTraineeWorker(workerType, employmentStatus);
}

function normalizeRoute(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function routeAliases(route: ManagerScheduleRoute) {
  return [route.route_name, route.current_wa_num].map(normalizeRoute).filter(Boolean);
}

export function capacitySignal(
  delta: number,
  workforce: number,
  routeDemand: number,
): ManagerCapacitySignal {
  if (workforce === 0 && routeDemand === 0) return "NO_OPERATION";
  if (delta < 0) return "SERVICE_RISK";
  if (delta === 0) return "NO_CONTINGENCY";
  if (delta <= 2) return "TARGET_RANGE";
  if (delta <= 5) return "LABOR_HIGH";
  return "PROFITABILITY_RISK";
}

export function capacitySignalLabel(signal: ManagerCapacitySignal) {
  if (signal === "NO_OPERATION") return "No operation";
  if (signal === "SERVICE_RISK") return "Service risk";
  if (signal === "NO_CONTINGENCY") return "No contingency";
  if (signal === "TARGET_RANGE") return "Target range";
  if (signal === "LABOR_HIGH") return "Labor high";
  return "Profitability risk";
}

export function resolveBaselineScheduledOffDrivers(rows: ManagerScheduleRow[]) {
  return rows.filter(
    (row) => !row.planned_on
      && !row.override_type
      && isDriverSeatWorker(row.worker_type, row.employment_status),
  );
}

export function resolveOverrideOffRows(rows: ManagerScheduleRow[]) {
  return rows.filter((row) => !row.planned_on && Boolean(row.override_type));
}

function cleanName(value: string | null | undefined) {
  return value?.trim() || "Roster member";
}

export function buildManagerScheduleWorkbenchRows(params: {
  roster: ManagerScheduleRosterMember[];
  baselines: ManagerScheduleBaseline[];
  presets: ManagerSchedulePreset[];
}): ManagerScheduleWorkbenchRow[] {
  const baselineByRosterId = new Map<string, ManagerScheduleBaseline>();
  for (const baseline of params.baselines) {
    if (!baselineByRosterId.has(baseline.roster_member_id)) {
      baselineByRosterId.set(baseline.roster_member_id, baseline);
    }
  }
  const presetById = new Map(params.presets.map((preset) => [preset.id, preset]));

  return params.roster.map((member) => {
    const baseline = baselineByRosterId.get(member.roster_member_id) ?? null;
    const preset = baseline?.preset_id
      ? presetById.get(baseline.preset_id) ?? null
      : null;
    const defaultRoutes = baseline
      ? [
        baseline.default_route_s,
        baseline.default_route_u,
        baseline.default_route_m,
        baseline.default_route_t,
        baseline.default_route_w,
        baseline.default_route_h,
        baseline.default_route_f,
      ].map(normalizeRoute).filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
      : [];

    return {
      rosterMemberId: member.roster_member_id,
      fullName: cleanName(member.full_name),
      workerType: member.worker_type,
      employmentStatus: member.employment_status,
      baselineId: baseline?.id ?? null,
      presetId: baseline?.preset_id ?? null,
      presetCode: preset?.preset_code ?? null,
      rotationMode: baseline?.rotation_mode ?? null,
      anchorDate: baseline?.anchor_date ?? null,
      effectiveStart: baseline?.effective_start ?? null,
      defaultRoutes,
      baseline,
      schedulePending: !baseline?.preset_id,
    };
  });
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
    (row) => row.planned_on && isDriverSeatWorker(row.worker_type, row.employment_status),
  );
  const assignedDrivers = scheduledDrivers.filter((row) => Boolean(normalizeRoute(row.route_name)));
  const assignedRouteNames = new Set(assignedDrivers.map((row) => normalizeRoute(row.route_name)));
  const assignedRoutes = demandedRoutes.filter(
    (route) => routeAliases(route).some((alias) => assignedRouteNames.has(alias)),
  );
  const openRoutes = demandedRoutes.filter(
    (route) => !routeAliases(route).some((alias) => assignedRouteNames.has(alias)),
  );
  const standbyDrivers = scheduledDrivers.filter((row) => !normalizeRoute(row.route_name));
  const baselineScheduledOffDrivers = resolveBaselineScheduledOffDrivers(params.rows);
  const traineeRows = params.rows.filter(
    (row) => isTraineeWorker(row.worker_type, row.employment_status),
  );
  const overrideOffRows = resolveOverrideOffRows(params.rows).filter(
    (row) => !isTraineeWorker(row.worker_type, row.employment_status),
  );
  const capacityDelta = scheduledDrivers.length - demandedRoutes.length;

  return {
    serviceDate: params.serviceDate,
    scheduledDrivers: scheduledDrivers.length,
    routeDemand: demandedRoutes.length,
    assignedDrivers: assignedDrivers.length,
    assignedRoutes: assignedRoutes.length,
    openRoutes,
    standbyDrivers,
    baselineScheduledOffDrivers,
    overrideOffRows,
    traineeRows,
    capacityDelta,
    signal: capacitySignal(capacityDelta, scheduledDrivers.length, demandedRoutes.length),
  };
}

export function buildManagerScheduleSnapshot(params: {
  weekStart: string;
  horizonDays?: number;
  routes: ManagerScheduleRoute[];
  rows: ManagerScheduleRow[];
  requests: ManagerTimeOffRequest[];
  overrides: ManagerScheduleOverride[];
  roster?: ManagerScheduleRosterMember[];
  baselines?: ManagerScheduleBaseline[];
  presets?: ManagerSchedulePreset[];
}): ManagerScheduleSnapshot {
  const horizonDays = Math.max(7, params.horizonDays ?? 7);
  const days = Array.from({ length: horizonDays }, (_, index) => {
    const serviceDate = addScheduleDays(params.weekStart, index);
    return resolveManagerScheduleDay({
      serviceDate,
      routes: params.routes,
      rows: params.rows.filter((row) => row.service_date === serviceDate),
    });
  });
  return {
    weekStart: params.weekStart,
    weekEnd: addScheduleDays(params.weekStart, horizonDays - 1),
    days,
    pendingRequests: params.requests.filter((request) => request.status === "PENDING"),
    activeOverrides: params.overrides,
    workbenchRows: buildManagerScheduleWorkbenchRows({
      roster: params.roster ?? [],
      baselines: params.baselines ?? [],
      presets: params.presets ?? [],
    }),
    presets: params.presets ?? [],
    generatedAt: new Date().toISOString(),
  };
}
