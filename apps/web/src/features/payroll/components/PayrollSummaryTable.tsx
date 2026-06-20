"use client";

import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";
import { workedDaysLabel } from "@/features/payroll/lib/payroll.date";

const thStyle = {
  position: "sticky" as const,
  top: 0,
  background: "#f8fafc",
  borderBottom: "1px solid #e6edf5",
  padding: "9px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  textAlign: "left" as const,
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "9px 10px",
  color: "#334155",
  fontSize: 13,
};

export default function PayrollSummaryTable({
  groupedSummaryRows,
}: {
  groupedSummaryRows: {
    group: string;
    rows: PayrollSummaryRow[];
  }[];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 760 }}>
        <thead>
          <tr>
            <th style={thStyle}>Employee</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Days Worked</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Base Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Threshold Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Total Earnings</th>
          </tr>
        </thead>
        <tbody>
          {groupedSummaryRows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No payroll activity found for this week.
              </td>
            </tr>
          ) : (
            groupedSummaryRows.flatMap(({ group, rows }) => [
              <tr key={`group-${group}`}>
                <td
                  colSpan={5}
                  style={{
                    ...tdStyle,
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {group}
                </td>
              </tr>,
              ...rows.map((row) => (
                <tr key={`${group}-${row.roster_member_id ?? row.person_name}`}>
                  <td style={tdStyle}><strong>{row.person_name}</strong></td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {workedDaysLabel(row.days_worked, row.worked_days)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {money(row.daily_pay_total)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {money(row.threshold_pay_total)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>
                    {money(row.estimated_total)}
                  </td>
                </tr>
              )),
            ])
          )}
        </tbody>
      </table>
    </div>
  );
}
