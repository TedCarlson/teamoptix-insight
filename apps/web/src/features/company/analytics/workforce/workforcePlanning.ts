import type { OperationsHistoryRow } from "../operationsHistory.types";

export type WorkforcePlanningMonth = {
  scheduled_assignments: number;
  scheduled_days: number;
  call_outs: number;
  no_shows: number;
  approved_time_off_days: number;
};

export type WorkforcePlanStatus = "critical" | "light" | "optimal" | "heavy";

export type WorkforcePlanScenario = {
  key: "five_day" | "six_day" | "peak";
  label: string;
  eyebrow: string;
  target: number;
  evidenceTarget: number | null;
  current: number;
  noticeDepartures: number;
  projectedCurrent: number;
  delta: number;
  status: WorkforcePlanStatus;
  readinessPercent: number;
  driverDays: number;
  operatingDays: number;
  planningRoutesPerDay: number;
  planningRoutesLow: number | null;
  planningRoutesHigh: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  explanation: string;
};

export type WorkforcePlan = {
  recentWindowStart: string | null;
  recentWindowEnd: string | null;
  peakWindowStart: string | null;
  peakWindowEnd: string | null;
  recentPlanningRoutesPerDay: number;
  peakPlanningRoutesPerDay: number;
  peakMaximumRoutesPerDay: number;
  observedOperatingDaysPerWeek: number;
  coverageFactor: number;
  evidenceCoverageFactor: number | null;
  availability: number;
  availabilityKnown: boolean;
  scenarios: WorkforcePlanScenario[];
};

type Week = {
  start: string;
  end: string;
  rows: Array<{ date: string; routes: number }>;
};

const DAY_MS = 86_400_000;
export const DEFAULT_COVERAGE_FACTOR = 1.125;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function addDays(value: string, days: number) {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function saturdayFor(value: string) {
  const date = dateFromIso(value);
  const daysSinceSaturday = (date.getUTCDay() + 1) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceSaturday);
  return isoDate(date);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupCompleteWeeks(rows: OperationsHistoryRow[], throughDate: string): Week[] {
  const weeks = new Map<string, Week>();
  for (const row of rows) {
    const date = row.service_date.slice(0, 10);
    if (date > throughDate) continue;
    const start = saturdayFor(date);
    const end = addDays(start, 6);
    if (end > throughDate) continue;
    const week = weeks.get(start) ?? { start, end, rows: [] };
    const routes = Number(row.route_count);
    week.rows.push({ date, routes: Number.isFinite(routes) ? routes : 0 });
    weeks.set(start, week);
  }
  return Array.from(weeks.values()).sort((a, b) => a.start.localeCompare(b.start));
}

function consecutiveFiveWeekWindows(weeks: Week[]) {
  const windows: Week[][] = [];
  for (let index = 0; index <= weeks.length - 5; index += 1) {
    const candidate = weeks.slice(index, index + 5);
    const first = dateFromIso(candidate[0].start).getTime();
    const last = dateFromIso(candidate[4].start).getTime();
    if (last - first === 28 * DAY_MS) windows.push(candidate);
  }
  return windows;
}

function scenarioStatus(current: number, target: number): WorkforcePlanStatus {
  if (target <= 0) return "optimal";
  const readiness = current / target;
  if (readiness < 0.85) return "critical";
  if (readiness < 1) return "light";
  if (readiness > 1.1) return "heavy";
  return "optimal";
}

function makeScenario(input: Omit<WorkforcePlanScenario, "target" | "evidenceTarget" | "delta" | "status" | "readinessPercent"> & {
  coverageFactor: number;
  evidenceCoverageFactor: number | null;
}) {
  const rawHeadcount = (input.planningRoutesPerDay * input.operatingDays) / input.driverDays;
  const target = input.planningRoutesPerDay > 0
    ? Math.ceil(rawHeadcount * input.coverageFactor)
    : 0;
  const evidenceTarget = input.planningRoutesPerDay > 0 && input.evidenceCoverageFactor != null
    ? Math.ceil(rawHeadcount * input.evidenceCoverageFactor)
    : null;
  const projectedCurrent = Math.max(0, input.projectedCurrent);
  return {
    key: input.key,
    label: input.label,
    eyebrow: input.eyebrow,
    target,
    evidenceTarget,
    current: input.current,
    noticeDepartures: input.noticeDepartures,
    projectedCurrent,
    delta: projectedCurrent - target,
    status: scenarioStatus(projectedCurrent, target),
    readinessPercent: target > 0 ? (projectedCurrent / target) * 100 : 100,
    driverDays: input.driverDays,
    operatingDays: input.operatingDays,
    planningRoutesPerDay: input.planningRoutesPerDay,
    planningRoutesLow: input.planningRoutesLow,
    planningRoutesHigh: input.planningRoutesHigh,
    targetLow: input.targetLow,
    targetHigh: input.targetHigh,
    explanation: input.explanation,
  } satisfies WorkforcePlanScenario;
}

export function calculateWorkforceTarget(
  routesPerDay: number,
  operatingDays: number,
  driverDays: number,
  coverageFactor: number
) {
  if (routesPerDay <= 0 || operatingDays <= 0 || driverDays <= 0 || coverageFactor <= 0) return 0;
  return Math.ceil((routesPerDay * operatingDays * coverageFactor) / driverDays);
}

export function buildWorkforcePlan(
  rows: OperationsHistoryRow[],
  throughDate: string,
  activeDrivers: number,
  monthly: WorkforcePlanningMonth[],
  routeReadyNoticeDepartures = 0
): WorkforcePlan {
  const completeWeeks = groupCompleteWeeks(rows, throughDate);
  const recentWeeks = completeWeeks.slice(-5);
  const recentRows = recentWeeks.flatMap((week) => week.rows);
  const recentPlanningRoutesPerDay = average(recentRows.map((row) => row.routes));
  const observedOperatingDaysPerWeek = recentWeeks.length
    ? recentRows.length / recentWeeks.length
    : 0;

  const peakWindow = consecutiveFiveWeekWindows(completeWeeks).reduce<Week[] | null>((best, candidate) => {
    const candidateRoutes = candidate.flatMap((week) => week.rows).map((row) => row.routes);
    const bestRoutes = best?.flatMap((week) => week.rows).map((row) => row.routes) ?? [];
    const candidateAverage = candidateRoutes.length ? candidateRoutes.reduce((sum, value) => sum + value, 0) / candidateRoutes.length : 0;
    const bestAverage = bestRoutes.length ? bestRoutes.reduce((sum, value) => sum + value, 0) / bestRoutes.length : -1;
    return candidateAverage > bestAverage ? candidate : best;
  }, null) ?? recentWeeks;
  const peakRows = peakWindow.flatMap((week) => week.rows);
  const peakPlanningRoutesPerDay = average(peakRows.map((row) => row.routes));
  const peakMaximumRoutesPerDay = peakRows.length
    ? Math.max(...peakRows.map((row) => row.routes))
    : peakPlanningRoutesPerDay;

  const recordedMonths = monthly.filter((month) => month.scheduled_assignments > 0 && month.scheduled_days > 0);
  const scheduledAssignments = recordedMonths.reduce((sum, month) => sum + month.scheduled_assignments, 0);
  const unavailableAssignments = recordedMonths.reduce(
    (sum, month) => sum + month.call_outs + month.no_shows + month.approved_time_off_days,
    0
  );
  const availabilityKnown = scheduledAssignments > 0;
  const availability = availabilityKnown
    ? Math.max(0.01, Math.min(1, 1 - unavailableAssignments / scheduledAssignments))
    : 1;
  const evidenceCoverageFactor = availabilityKnown ? 1 / availability : null;
  const bauOperatingDays = Math.max(1, Math.round(observedOperatingDaysPerWeek));

  return {
    recentWindowStart: recentWeeks[0]?.start ?? null,
    recentWindowEnd: recentWeeks.at(-1)?.end ?? null,
    peakWindowStart: peakWindow[0]?.start ?? null,
    peakWindowEnd: peakWindow.at(-1)?.end ?? null,
    recentPlanningRoutesPerDay,
    peakPlanningRoutesPerDay,
    peakMaximumRoutesPerDay,
    observedOperatingDaysPerWeek,
    coverageFactor: DEFAULT_COVERAGE_FACTOR,
    evidenceCoverageFactor,
    availability,
    availabilityKnown,
    scenarios: [
      makeScenario({
        key: "five_day",
        eyebrow: "Sustainable roster",
        label: "5-day driver plan",
        current: activeDrivers,
        noticeDepartures: routeReadyNoticeDepartures,
        projectedCurrent: Math.max(0, activeDrivers - routeReadyNoticeDepartures),
        driverDays: 5,
        operatingDays: bauOperatingDays,
        planningRoutesPerDay: recentPlanningRoutesPerDay,
        planningRoutesLow: null,
        planningRoutesHigh: null,
        targetLow: null,
        targetHigh: null,
        coverageFactor: DEFAULT_COVERAGE_FACTOR,
        evidenceCoverageFactor,
        explanation: "Each active driver supplies five route-days; relief is retained for observed absences.",
      }),
      makeScenario({
        key: "six_day",
        eyebrow: "Flex capacity",
        label: "6-day driver plan",
        current: activeDrivers,
        noticeDepartures: routeReadyNoticeDepartures,
        projectedCurrent: Math.max(0, activeDrivers - routeReadyNoticeDepartures),
        driverDays: 6,
        operatingDays: bauOperatingDays,
        planningRoutesPerDay: recentPlanningRoutesPerDay,
        planningRoutesLow: null,
        planningRoutesHigh: null,
        targetLow: null,
        targetHigh: null,
        coverageFactor: DEFAULT_COVERAGE_FACTOR,
        evidenceCoverageFactor,
        explanation: "Shows the smaller roster possible when every active driver carries a sixth day.",
      }),
      makeScenario({
        key: "peak",
        eyebrow: "Seasonal ramp",
        label: "Peak staffing range",
        current: activeDrivers,
        noticeDepartures: routeReadyNoticeDepartures,
        projectedCurrent: Math.max(0, activeDrivers - routeReadyNoticeDepartures),
        driverDays: 6,
        operatingDays: 7,
        planningRoutesPerDay: peakMaximumRoutesPerDay,
        planningRoutesLow: peakPlanningRoutesPerDay,
        planningRoutesHigh: peakMaximumRoutesPerDay,
        targetLow: calculateWorkforceTarget(peakPlanningRoutesPerDay, 7, 6, DEFAULT_COVERAGE_FACTOR),
        targetHigh: calculateWorkforceTarget(peakMaximumRoutesPerDay, 7, 6, DEFAULT_COVERAGE_FACTOR),
        coverageFactor: DEFAULT_COVERAGE_FACTOR,
        evidenceCoverageFactor,
        explanation: "Observed sustained Peak average through the highest route day, with drivers planned across six days.",
      }),
    ],
  };
}
