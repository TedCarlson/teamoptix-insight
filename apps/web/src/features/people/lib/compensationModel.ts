export type CompensationBasis = "HOURLY" | "DAILY" | "WEEKLY";

export const DEFAULT_HOURS_PER_WEEK = 40;
export const DEFAULT_DAYS_PER_WEEK = 5;
export const WEEKS_PER_YEAR = 52;

export function annualizeCompensation(input: {
  basis: CompensationBasis;
  rate: number;
  hoursPerWeek?: number;
  daysPerWeek?: number;
}) {
  const rate = Number.isFinite(input.rate) ? Math.max(0, input.rate) : 0;

  if (input.basis === "HOURLY") {
    const hours = Number.isFinite(input.hoursPerWeek)
      ? Math.max(0, input.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK)
      : DEFAULT_HOURS_PER_WEEK;
    return rate * hours * WEEKS_PER_YEAR;
  }

  if (input.basis === "DAILY") {
    const days = Number.isFinite(input.daysPerWeek)
      ? Math.max(0, input.daysPerWeek ?? DEFAULT_DAYS_PER_WEEK)
      : DEFAULT_DAYS_PER_WEEK;
    return rate * days * WEEKS_PER_YEAR;
  }

  return rate * WEEKS_PER_YEAR;
}
