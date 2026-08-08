import type { RosterRow } from "@/features/people/types/roster.types";

export function buildPayrollAdjustmentCandidates(
  roster: RosterRow[],
  payrollActivityRosterIds: Iterable<string>
) {
  const activityRosterIds = new Set(payrollActivityRosterIds);

  return roster
    .filter(
      (row) =>
        row.employment_status === "Active" ||
        row.employment_status === "Trainee" ||
        activityRosterIds.has(row.roster_member_id)
    )
    .sort((a, b) =>
      String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""))
    );
}
