import {
  resolveDailyScheduleCapacity,
  type ScheduleCapacityPerson,
  type ScheduleCapacityRoute,
  type ScheduleCoverageSeam,
} from "./scheduleCapacity";

export type ScheduleCoverageRow = ScheduleCapacityPerson & {
  service_date: string;
};

export type ScheduleCoverageSummary = {
  startDate: string;
  endDate: string;
  demandRouteDays: number;
  coveredRouteDays: number;
  openRouteDays: number;
  coveragePercent: number;
  coveredByProgram: { STANDARD: number; AVP: number };
  seamCount: number;
  seams: Array<ScheduleCoverageSeam & { serviceDate: string }>;
};

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function datesBetween(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function summarizeScheduleCoverage(params: {
  startDate: string;
  endDate: string;
  routes: ScheduleCapacityRoute[];
  scheduleRows: ScheduleCoverageRow[];
}): ScheduleCoverageSummary {
  const byDate = new Map<string, ScheduleCoverageRow[]>();
  for (const row of params.scheduleRows) {
    const rows = byDate.get(row.service_date) ?? [];
    rows.push(row);
    byDate.set(row.service_date, rows);
  }

  let demandRouteDays = 0;
  let coveredRouteDays = 0;
  const coveredByProgram = { STANDARD: 0, AVP: 0 };
  const seams: ScheduleCoverageSummary["seams"] = [];

  for (const serviceDate of datesBetween(params.startDate, params.endDate)) {
    const capacity = resolveDailyScheduleCapacity({
      serviceDate,
      routes: params.routes,
      scheduleRows: byDate.get(serviceDate) ?? [],
    });
    demandRouteDays += capacity.routeDemand;
    coveredRouteDays += capacity.assignedRoutes;
    coveredByProgram.STANDARD += capacity.coveredRoutesByProgram.STANDARD;
    coveredByProgram.AVP += capacity.coveredRoutesByProgram.AVP;
    seams.push(...capacity.seams.map((seam) => ({ ...seam, serviceDate })));
  }

  return {
    startDate: params.startDate,
    endDate: params.endDate,
    demandRouteDays,
    coveredRouteDays,
    openRouteDays: Math.max(0, demandRouteDays - coveredRouteDays),
    coveragePercent: demandRouteDays ? (coveredRouteDays / demandRouteDays) * 100 : 100,
    coveredByProgram,
    seamCount: seams.length,
    seams,
  };
}
