"use client";

import type { PayrollActivityRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";

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

export default function PayrollRowDetailTable({
  detailRows,
}: {
  detailRows: PayrollActivityRow[];
}) {
  return (
    <div className="payroll-family-table-wrap" style={{ overflowX: "auto" }}>
      <table className="payroll-family-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1220 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>Employee</th>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>WA</th>
            <th style={thStyle}>Route</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Del</th>
            <th style={{ ...thStyle, textAlign: "right" }}>PU</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Stops</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Tsh</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Over</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
            <th style={{ ...thStyle, textAlign: "right" }}>TSH Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Adjustments</th>
            <th style={thStyle}>Math</th>
            <th style={thStyle}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {detailRows.length === 0 ? (
            <tr>
              <td colSpan={14} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No DSW payroll row detail found for this week.
              </td>
            </tr>
          ) : (
            detailRows.map((row, index) => {
              const delStops = Number(row.actual_delivery_stops ?? 0);
              const puStops = Number(row.actual_pickup_stops ?? 0);
              const totalStops = delStops + puStops;
              const tsh = Number(row.threshold_stops ?? 0);
              const over = Number(row.threshold_overage ?? 0);
              const rate = Number(row.threshold_rate ?? 0);
              const pay = Number(row.threshold_pay_amount ?? 0);
              const adjustment = Number(row.adjustment_amount ?? 0);
              const adjustmentLabels = Array.isArray(row.adjustment_labels) ? row.adjustment_labels.join(', ') : '';
              const flags = Array.isArray(row.review_flags) ? row.review_flags.join(", ") : "";
              const math = tsh > 0 ? `(${totalStops} - ${tsh}) = ${over} × ${money(rate)} = ${money(pay)}` : "No threshold";

              return (
                <tr key={`${row.person_name ?? "unknown"}-${row.service_date}-${row.wa_number ?? "wa"}-${index}`}>
                  <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 2, background: "#fff", minWidth: 220, boxShadow: "1px 0 0 #e6edf5" }}>
                    <strong>{row.person_name ?? "Unmatched"}</strong>
                  </td>
                  <td style={tdStyle}>{row.service_date}</td>
                  <td style={tdStyle}>{row.wa_number ?? "—"}</td>
                  <td style={tdStyle}>{row.route_name ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{delStops || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{puStops || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{totalStops || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{row.threshold_stops ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{row.threshold_overage ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{row.threshold_rate == null ? "—" : money(rate)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>{money(pay)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }} title={adjustmentLabels || "No adjustment"}>{adjustment ? money(adjustment) : "—"}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#475569", fontWeight: 800 }}>{math}</td>
                  <td style={tdStyle}>{flags || "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
