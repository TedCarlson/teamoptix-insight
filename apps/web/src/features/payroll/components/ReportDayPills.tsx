"use client";

import type { PayrollActivityRow } from "@/features/payroll/lib/payroll.types";
import { compactDayCode } from "@/features/payroll/lib/payroll.date";

export default function ReportDayPills(props: { days: string[]; activity: PayrollActivityRow[] }) {
  const finalizedDays = new Set(
    props.activity
      .filter((row) => (row.source_kind === "DSW_ACTUAL" || row.source_kind === "DSW_OWNERSHIP" || row.source_kind === "DSW_CANDIDATE") && row.attendance_status === "present")
      .map((row) => row.service_date)
  );

  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ color: "#64748b" }}>Report days</span>
      {props.days.map((day) => {
        const hasFinal = finalizedDays.has(day);
        return (
          <span
            key={day}
            title={hasFinal ? `${day} included in report` : `${day} pending final DSW`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              border: `1px solid ${hasFinal ? "#bbf7d0" : "#e2e8f0"}`,
              background: hasFinal ? "#ecfdf5" : "#f8fafc",
              color: hasFinal ? "#166534" : "#94a3b8",
              borderRadius: 999,
              padding: "2px 7px",
              fontSize: 11,
              fontWeight: 950,
            }}
          >
            {hasFinal ? "✓" : "—"} {compactDayCode(day)}
          </span>
        );
      })}
    </span>
  );
}
