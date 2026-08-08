import type { RosterRow } from "@/features/people/types/roster.types";
import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";

export function normalizedStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function isActiveStatus(value: string | null | undefined) {
  return normalizedStatus(value) === "active";
}

export function isTraineeStatus(value: string | null | undefined) {
  return normalizedStatus(value) === "trainee";
}

export function isDriverType(value: string | null | undefined) {
  return normalizedStatus(value) === "driver";
}

export function payrollSummaryGroup(row: PayrollSummaryRow, rosterById: Map<string, RosterRow>) {
  const roster = row.roster_member_id ? rosterById.get(row.roster_member_id) : undefined;
  const driver = isDriverType(roster?.worker_type);
  const active = isActiveStatus(roster?.employment_status);
  const trainee = isTraineeStatus(roster?.employment_status);
  const walkOn =
    roster?.roster_record_kind === "WALK_ON" ||
    Object.values(row.worked_day_kinds ?? {}).includes("WALK_ON");

  if (walkOn) return "Walk-ons · Support";
  if (driver && trainee) return "Drivers · Trainee";
  if (driver && active) return "Drivers · Active";
  if (driver && !active) return "Drivers · Former";
  if (!driver && trainee) return "Other · Trainee";
  if (!driver && active) return "Other · Active";
  return "Other · Former / unmatched";
}
