import type { RosterRow } from "@/features/people/types/roster.types";
import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";
import { payrollSummaryGroup } from "@/features/payroll/lib/payroll.classification";

export function buildPayrollSummaryGroups(
  summaryRows: PayrollSummaryRow[],
  rosterById: Map<string, RosterRow>
) {
  const groups = new Map<string, PayrollSummaryRow[]>();

  for (const row of summaryRows) {
    const group = payrollSummaryGroup(row, rosterById);
    const current = groups.get(group) ?? [];
    current.push(row);
    groups.set(group, current);
  }

  return Array.from(groups.entries()).map(([group, rows]) => ({
    group,
    rows: rows.sort((a, b) => a.person_name.localeCompare(b.person_name)),
  }));
}
