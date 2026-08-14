"use client";

import { useMemo, useState } from "react";
import type { PayrollDriverDayDetailRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";
import { compactDayCode } from "@/features/payroll/lib/payroll.date";
import PayrollDriverWeekInlineDetail from "@/features/payroll/components/PayrollDriverWeekInlineDetail";

type DriverWeekRow = {
  key: string;
  person_name: string;
  day_count: number;
  total_stops: number;
  threshold_pay_total: number;
  daily_pay_total: number;
  adjustment_pay_total: number;
  estimated_total: number;
  source_row_count: number;
  flags: string[];
  days: PayrollDriverDayDetailRow[];
  byDate: Map<string, PayrollDriverDayDetailRow>;
};

export default function PayrollDetailTable({
  rows,
  days,
}: {
  rows: PayrollDriverDayDetailRow[];
  days: string[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const weeklyRows = useMemo(() => buildDriverWeekRows(rows), [rows]);

  return (
    <div className="payroll-family-table-wrap" style={{ overflowX: "auto" }}>
      <table className="payroll-family-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1060 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
              Employee
            </th>
            {days.map((day) => (
              <th key={day} style={{ ...thStyle, textAlign: "center", minWidth: 78, padding: "7px 4px" }}>
                {compactDayCode(day)}
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{day.slice(5)}</div>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: "right" }}>TSH Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Daily Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Adjustments</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Rows</th>
            <th style={thStyle}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {weeklyRows.length === 0 ? (
            <tr>
              <td colSpan={days.length + 7} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No normalized payroll detail found for this week.
              </td>
            </tr>
          ) : (
            weeklyRows.flatMap((row) => {
              const isSelected = selectedKey === row.key;

              return [
                <tr
                  key={row.key}
                  onClick={() => setSelectedKey(isSelected ? null : row.key)}
                  className={isSelected ? "is-selected" : undefined}
                  style={{ cursor: "pointer", background: isSelected ? "#f8fafc" : "#fff" }}
                  title={isSelected ? "Click to collapse detail" : "Click to expand detail"}
                >
                  <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 2, background: isSelected ? "#f8fafc" : "#fff", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
                    <strong>{row.person_name}</strong>
                  </td>

                  {days.map((day) => {
                    const dayRow = row.byDate.get(day);

                    return (
                      <td key={day} style={{ ...tdStyle, textAlign: "center", verticalAlign: "top", padding: "7px 4px" }}>
                        {dayRow ? (
                          <div style={{ display: "grid", gap: 1, justifyItems: "center", lineHeight: 1.08 }}>
                            <strong>WA {dayRow.dominant_route?.wa_number ?? "—"}</strong>
                            <span style={{ color: "#475569", fontSize: 10 }}>{dayRow.total_stops} stops</span>
                            <span style={{ color: "#475569", fontSize: 10 }}>TSH {money(dayRow.threshold_pay_amount)}</span>
                            <span style={{ color: "#94a3b8", fontSize: 9 }}>
                              {dayRow.source_row_count} source row{dayRow.source_row_count === 1 ? "" : "s"}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontWeight: 900 }}>—</span>
                        )}
                      </td>
                    );
                  })}

                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{money(row.threshold_pay_total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{money(row.daily_pay_total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{money(row.adjustment_pay_total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{money(row.estimated_total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{row.source_row_count}</td>
                  <td style={tdStyle}>{row.flags.length ? row.flags.join(", ") : "—"}</td>
                </tr>,
                isSelected ? (
                  <tr key={`${row.key}-detail`}>
                    <td className="payroll-family-table__detail-cell" colSpan={days.length + 7} style={{ padding: 10, background: "#fff" }}>
                      <PayrollDriverWeekInlineDetail rows={row.days} />
                    </td>
                  </tr>
                ) : null,
              ];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function buildDriverWeekRows(rows: PayrollDriverDayDetailRow[]): DriverWeekRow[] {
  const groups = new Map<string, PayrollDriverDayDetailRow[]>();

  for (const row of rows) {
    const key = row.roster_member_id ?? row.person_name;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, rowDays]) => {
      const flags = new Set<string>();
      const byDate = new Map<string, PayrollDriverDayDetailRow>();
      const sortedDays = [...rowDays].sort((a, b) => a.service_date.localeCompare(b.service_date));

      for (const day of sortedDays) {
        byDate.set(day.service_date, day);
        for (const flag of day.flags) flags.add(flag);
      }

      return {
        key,
        person_name: sortedDays[0]?.person_name ?? "Unmatched",
        day_count: sortedDays.length,
        total_stops: sortedDays.reduce((sum, row) => sum + row.total_stops, 0),
        threshold_pay_total: sortedDays.reduce((sum, row) => sum + row.threshold_pay_amount, 0),
        daily_pay_total: sortedDays.reduce((sum, row) => sum + row.daily_pay_applied, 0),
        adjustment_pay_total: sortedDays.reduce((sum, row) => sum + row.adjustment_pay_amount, 0),
        estimated_total: sortedDays.reduce((sum, row) => sum + row.estimated_total, 0),
        source_row_count: sortedDays.reduce((sum, row) => sum + row.source_row_count, 0),
        flags: Array.from(flags).sort(),
        days: sortedDays,
        byDate,
      };
    })
    .sort((a, b) => a.person_name.localeCompare(b.person_name));
}

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
