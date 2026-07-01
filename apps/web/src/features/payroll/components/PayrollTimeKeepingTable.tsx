import {
  formatClockTime,
  formatDuration,
  stateLabel,
  summarizeTimeKeepingRows,
  type PayrollTimeKeepingRow,
} from "@/features/payroll/lib/payroll.timekeeping";

type PayrollTimeKeepingTableProps = {
  rows: PayrollTimeKeepingRow[];
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};

export function PayrollTimeKeepingTable({ rows }: PayrollTimeKeepingTableProps) {
  const summary = summarizeTimeKeepingRows(rows);

  return (
    <section className="value-strip" style={{ paddingTop: 12 }}>
      <div className="value-grid">
        <article className="value-card">
          <p className="value-card__eyebrow">Time Keeping</p>
          <h3 className="value-card__title">Workday records</h3>
          <p className="value-card__value">{summary.totalRows}</p>
        </article>

        <article className="value-card">
          <p className="value-card__eyebrow">Active</p>
          <h3 className="value-card__title">Clocked in</h3>
          <p className="value-card__value">{summary.activeSessions}</p>
        </article>

        <article className="value-card">
          <p className="value-card__eyebrow">Closed</p>
          <h3 className="value-card__title">Clocked out</h3>
          <p className="value-card__value">{summary.closedSessions}</p>
        </article>

        <article className="value-card">
          <p className="value-card__eyebrow">Review</p>
          <h3 className="value-card__title">Missing clock out</h3>
          <p className="value-card__value">{summary.missingClockOut}</p>
        </article>

        <article className="value-card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="value-card__eyebrow">Time Keeping</p>
              <h3 className="value-card__title">Clock activity by driver</h3>
            </div>
            <span style={{ color: "#64748b", fontWeight: 800 }}>
              {rows.length} records
            </span>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: "16px 0" }}>No clock activity found for this week.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                <thead>
                  <tr>
                    {[
                      "Driver",
                      "Date",
                      "Clock In",
                      "Clock Out",
                      "Duration",
                      "State",
                      "Events",
                    ].map((label) => (
                      <th
                        key={label}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderBottom: "1px solid #d6dfeb",
                          fontSize: 12,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "#5c6b84",
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.roster_member_id}-${row.service_date}`}>
                      <td style={cellStyle}>
                        <div style={{ fontWeight: 800 }}>
                          {row.full_name ?? "Unknown driver"}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {row.worker_type ?? "—"}
                        </div>
                      </td>
                      <td style={cellStyle}>{row.service_date}</td>
                      <td style={cellStyle}>{formatClockTime(row.clock_in)}</td>
                      <td style={cellStyle}>{formatClockTime(row.clock_out)}</td>
                      <td style={cellStyle}>{formatDuration(row.clock_in, row.clock_out)}</td>
                      <td style={cellStyle}>{stateLabel(row.state)}</td>
                      <td style={cellStyle}>{row.event_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
