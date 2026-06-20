"use client";

import type { AttendanceRow } from "@/features/payroll/lib/payroll.types";
import { cellDisplay, emptyCell } from "@/features/payroll/lib/payroll.attendance";
import { dayLabel } from "@/features/payroll/lib/payroll.date";

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

export default function PayrollAttendanceTable({
  attendanceRows,
  days,
}: {
  attendanceRows: AttendanceRow[];
  days: string[];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 860 }}>
        <thead>
          <tr>
            <th style={thStyle}>Employee</th>
            <th style={thStyle}>Type</th>
            {days.map((day) => (
              <th key={day} style={{ ...thStyle, textAlign: "center" }}>
                {dayLabel(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attendanceRows.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No attendance signals found for this week.
              </td>
            </tr>
          ) : (
            attendanceRows.map((row) => (
              <tr key={row.roster_member_id}>
                <td style={tdStyle}>
                  <strong>{row.full_name}</strong>
                </td>
                <td style={tdStyle}>{row.worker_type ?? "—"}</td>
                {days.map((day) => {
                  const cell = row.days[day] ?? emptyCell();
                  const display = cellDisplay(cell);

                  return (
                    <td key={day} style={{ ...tdStyle, textAlign: "center" }}>
                      <div
                        title={display.title}
                        style={{
                          display: "inline-grid",
                          justifyItems: "center",
                          gap: 3,
                          minWidth: cell.details.length > 0 ? 72 : 28,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            border: `1px solid ${display.border}`,
                            background: display.bg,
                            color: display.tone,
                            fontWeight: 950,
                          }}
                        >
                          {display.label}
                        </span>
                        {cell.details.length > 0 ? (
                          <span
                            style={{
                              display: "grid",
                              gap: 1,
                              color: "#475569",
                              fontSize: 10,
                              fontWeight: 850,
                              lineHeight: 1.1,
                            }}
                          >
                            {cell.details.slice(0, 3).map((detail) => (
                              <span key={detail}>{detail}</span>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
