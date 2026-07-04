"use client";

import type { PayrollDriverDayDetailRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";

export default function PayrollDriverWeekInlineDetail({
  rows,
}: {
  rows: PayrollDriverDayDetailRow[];
}) {
  const sortedRows = [...rows].sort((a, b) => a.service_date.localeCompare(b.service_date));

  const totalDeliveryStops = sortedRows.reduce((sum, row) => sum + (row.dominant_route?.delivery_stops ?? 0), 0);
  const totalPickupStops = sortedRows.reduce((sum, row) => sum + (row.dominant_route?.pickup_stops ?? 0), 0);
  const totalStops = sortedRows.reduce((sum, row) => sum + row.total_stops, 0);
  const totalSourceRows = sortedRows.reduce((sum, row) => sum + row.source_row_count, 0);
  const totalOver = sortedRows.reduce((sum, row) => sum + row.threshold_overage, 0);
  const totalThresholdPay = sortedRows.reduce((sum, row) => sum + row.threshold_pay_amount, 0);
  const totalDailyPay = sortedRows.reduce((sum, row) => sum + row.daily_pay_applied, 0);
  const totalAdjustmentPay = sortedRows.reduce((sum, row) => sum + row.adjustment_pay_amount, 0);
  const totalPay = totalThresholdPay + totalDailyPay + totalAdjustmentPay;

  return (
    <div style={{ padding: 12, background: "#f8fafc", border: "1px solid #e6edf5", borderRadius: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1040 }}>
          <thead>
            <tr>
              <Th>Audit Row</Th>
              {sortedRows.map((row) => (
                <Th key={row.key}>{row.service_date}</Th>
              ))}
              <Th>Weekly Total</Th>
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Route Evidence" colSpan={sortedRows.length + 2} />
            <AuditRow label="Route" rows={sortedRows} total="—" render={(row) => row.dominant_route ? `WA ${row.dominant_route.wa_number}` : "—"} />
            <AuditRow label="Source Rows" rows={sortedRows} total={totalSourceRows} render={(row) => row.source_row_count} />
            <AuditRow label="Del" rows={sortedRows} total={totalDeliveryStops} render={(row) => row.dominant_route?.delivery_stops ?? 0} />
            <AuditRow label="PU" rows={sortedRows} total={totalPickupStops} render={(row) => row.dominant_route?.pickup_stops ?? 0} />
            <AuditRow label="Stops" rows={sortedRows} total={totalStops} render={(row) => row.total_stops} />
            <SectionRow label="Threshold Calculation" colSpan={sortedRows.length + 2} />
            <AuditRow label="Threshold" rows={sortedRows} total="—" render={(row) => row.threshold_stops ?? "—"} />
            <AuditRow label="Over" rows={sortedRows} total={totalOver} render={(row) => row.threshold_overage} />
            <AuditRow label="Rate" rows={sortedRows} total="—" render={(row) => row.threshold_rate == null ? "—" : money(row.threshold_rate)} />
            <SectionRow label="Compensation" colSpan={sortedRows.length + 2} />
            <AuditRow
              label="TSH Pay"
              rows={sortedRows}
              total={money(totalThresholdPay)}
              strong
              title={(row) =>
                row.threshold_stops == null
                  ? "No threshold"
                  : `(${row.total_stops} - ${row.threshold_stops}) = ${row.threshold_overage} × ${money(row.threshold_rate ?? 0)} = ${money(row.threshold_pay_amount)}`
              }
              render={(row) => money(row.threshold_pay_amount)}
            />
            <AuditRow label="Daily Pay" rows={sortedRows} total={money(totalDailyPay)} render={(row) => money(row.daily_pay_applied)} />
            <AuditRow label="Adjustments" rows={sortedRows} total={money(totalAdjustmentPay)} render={(row) => money(row.adjustment_pay_amount)} />
            <AuditRow label="Total Pay" rows={sortedRows} total={money(totalPay)} strong render={(row) => money(row.estimated_total)} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={sectionStyle}>{label}</td>
    </tr>
  );
}

function AuditRow({
  label,
  rows,
  total,
  render,
  strong = false,
  title,
}: {
  label: string;
  rows: PayrollDriverDayDetailRow[];
  total: React.ReactNode;
  render: (row: PayrollDriverDayDetailRow) => React.ReactNode;
  strong?: boolean;
  title?: (row: PayrollDriverDayDetailRow) => string;
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, fontWeight: 950, color: "#64748b", textAlign: "left" }}>{label}</td>
      {rows.map((row) => (
        <td key={`${row.key}-${label}`} title={title?.(row)} style={{ ...tdStyle, textAlign: "center" }}>
          {strong ? <strong>{render(row)}</strong> : render(row)}
        </td>
      ))}
      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 950, background: "#fff" }}>{total}</td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

const sectionStyle = {
  borderTop: "2px solid #dbe7f3",
  borderBottom: "1px solid #e6edf5",
  padding: "7px 10px",
  background: "#f1f5f9",
  color: "#475569",
  fontSize: 10,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const thStyle = {
  background: "#f8fafc",
  borderBottom: "1px solid #e6edf5",
  padding: "8px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  textAlign: "center" as const,
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "8px 10px",
  color: "#334155",
  fontSize: 13,
  verticalAlign: "top" as const,
};
