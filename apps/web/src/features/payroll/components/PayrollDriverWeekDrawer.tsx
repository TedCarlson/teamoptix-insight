"use client";

import type { PayrollDriverDayDetailRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";

export default function PayrollDriverWeekDrawer({
  driverName,
  rows,
  onClose,
}: {
  driverName: string;
  rows: PayrollDriverDayDetailRow[];
  onClose: () => void;
}) {
  const totalThreshold = rows.reduce((sum, row) => sum + row.threshold_pay_amount, 0);
  const totalDaily = rows.reduce((sum, row) => sum + row.daily_pay_applied, 0);
  const total = rows.reduce((sum, row) => sum + row.estimated_total, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.35)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        className="payroll-driver-week-drawer"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(980px, 94vw)",
          height: "100%",
          background: "#fff",
          boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.18)",
          padding: 18,
          overflow: "auto",
          display: "grid",
          gap: 14,
          alignContent: "start",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="eyebrow">Payroll Detail</p>
            <h2 style={{ margin: 0 }}>{driverName}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Weekly driver detail by service day.
            </p>
          </div>
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <Stat label="Daily Pay" value={money(totalDaily)} />
          <Stat label="Threshold Pay" value={money(totalThreshold)} />
          <Stat label="Total" value={money(total)} />
        </div>

        <div className="payroll-family-table-wrap" style={{ overflowX: "auto" }}>
          <table className="payroll-family-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 920 }}>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="payroll-driver-week-drawer__stat" style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
      <div className="context-stat__label">{label}</div>
      <strong style={{ fontSize: 18 }}>{value}</strong>
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
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "9px 10px",
  color: "#334155",
  fontSize: 13,
};
