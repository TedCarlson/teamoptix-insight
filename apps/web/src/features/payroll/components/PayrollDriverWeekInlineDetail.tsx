"use client";

import type { PayrollDriverDayDetailRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";

export default function PayrollDriverWeekInlineDetail({
  rows,
}: {
  rows: PayrollDriverDayDetailRow[];
}) {
  const totalStops = rows.reduce((sum, row) => sum + row.total_stops, 0);
  const totalOver = rows.reduce((sum, row) => sum + row.threshold_overage, 0);
  const totalThresholdPay = rows.reduce((sum, row) => sum + row.threshold_pay_amount, 0);
  const totalDailyPay = rows.reduce((sum, row) => sum + row.daily_pay_applied, 0);

  return (
    <div style={{ padding: 12, background: "#f8fafc", border: "1px solid #e6edf5", borderRadius: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 920 }}>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Route Collection</Th>
              <Th>Dominant</Th>
              <Th align="right">Stops</Th>
              <Th align="right">Threshold</Th>
              <Th align="right">Over</Th>
              <Th align="right">Rate</Th>
              <Th align="right">TSH Pay</Th>
              <Th align="right">Daily Pay</Th>
              <Th>Flags</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <Td>{row.service_date}</Td>
                <Td>{row.route_collection_label || "—"}</Td>
                <Td>{row.dominant_route ? `WA ${row.dominant_route.wa_number}` : "—"}</Td>
                <Td align="right">{row.total_stops}</Td>
                <Td align="right">{row.threshold_stops ?? "—"}</Td>
                <Td align="right">{row.threshold_overage}</Td>
                <Td align="right">{row.threshold_rate == null ? "—" : money(row.threshold_rate)}</Td>
                <Td align="right"><strong>{money(row.threshold_pay_amount)}</strong></Td>
                <Td align="right">{money(row.daily_pay_applied)}</Td>
                <Td>{row.flags.length ? row.flags.join(", ") : "—"}</Td>
              </tr>
            ))}

            <tr>
              <td style={totalStyle}>Weekly Total</td>
              <td style={totalStyle}>—</td>
              <td style={totalStyle}>—</td>
              <td style={{ ...totalStyle, textAlign: "right" }}>{totalStops}</td>
              <td style={{ ...totalStyle, textAlign: "right" }}>—</td>
              <td style={{ ...totalStyle, textAlign: "right" }}>{totalOver}</td>
              <td style={{ ...totalStyle, textAlign: "right" }}>—</td>
              <td style={{ ...totalStyle, textAlign: "right" }}>{money(totalThresholdPay)}</td>
              <td style={{ ...totalStyle, textAlign: "right" }}>{money(totalDailyPay)}</td>
              <td style={totalStyle}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ ...thStyle, textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td style={{ ...tdStyle, textAlign: align }}>{children}</td>;
}

const thStyle = {
  background: "#f8fafc",
  borderBottom: "1px solid #e6edf5",
  padding: "8px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "8px 10px",
  color: "#334155",
  fontSize: 13,
};

const totalStyle = {
  borderTop: "2px solid #dbe7f3",
  padding: "9px 10px",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 950,
  background: "#fff",
};
