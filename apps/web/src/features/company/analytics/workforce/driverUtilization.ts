import {
  classifyDriverProgram,
  deriveDriverUtilizationCategory,
} from "@/features/people/lib/driverWorkforceType";

export type DriverUtilizationRosterRow = {
  worker_type?: string | null;
  employment_status?: string | null;
  driver_program?: "STANDARD" | "AVP" | null;
  driver_utilization_category?:
    | "FULL_TIME"
    | "PART_TIME"
    | "UNSCHEDULED"
    | null;
  scheduled_days_per_week?: number | null;
  driver_full_time_day_threshold?: number | null;
  route_utilization_ratio?: number | string | null;
};

export type DriverUtilizationMeasure = {
  driverPositions: number;
  fullTime: number;
  partTime: number;
  avp: number;
  unscheduled: number;
  routeDayEquivalents: number;
  utilizationPercent: number;
};

function boundedRatio(value: unknown) {
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : null;
}

export function measureDriverUtilization(
  rows: DriverUtilizationRosterRow[],
): DriverUtilizationMeasure {
  const activeDrivers = rows
    .filter((row) => row.employment_status === "Active")
    .map((row) => {
      const program = row.driver_program ?? classifyDriverProgram(row.worker_type);
      if (!program) return null;

      const category =
        row.driver_utilization_category ??
        deriveDriverUtilizationCategory(
          row.scheduled_days_per_week,
          row.driver_full_time_day_threshold,
        );
      const threshold = Math.max(
        1,
        Number(row.driver_full_time_day_threshold ?? 5),
      );
      const derivedRatio = Math.min(
        1,
        Math.max(0, Number(row.scheduled_days_per_week ?? 0)) / threshold,
      );

      return {
        program,
        category,
        ratio: boundedRatio(row.route_utilization_ratio) ?? derivedRatio,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const routeDayEquivalents = activeDrivers.reduce(
    (sum, row) => sum + row.ratio,
    0,
  );
  const driverPositions = activeDrivers.length;

  return {
    driverPositions,
    fullTime: activeDrivers.filter((row) => row.category === "FULL_TIME").length,
    partTime: activeDrivers.filter((row) => row.category === "PART_TIME").length,
    avp: activeDrivers.filter((row) => row.program === "AVP").length,
    unscheduled: activeDrivers.filter((row) => row.category === "UNSCHEDULED").length,
    routeDayEquivalents,
    utilizationPercent: driverPositions
      ? Math.round((routeDayEquivalents / driverPositions) * 100)
      : 0,
  };
}
