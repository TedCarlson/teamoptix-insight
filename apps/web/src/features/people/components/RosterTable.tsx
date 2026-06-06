"use client";

import type { RosterRow } from "@/features/people/types/roster.types";

type Props = {
  rows: RosterRow[];
  onManagePerson?: (row: RosterRow) => void;
};

const cellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  fontSize: 14,
};

function Pill(props: {
  value: string | null | undefined;
  tone?: "good" | "warn" | "neutral";
}) {
  const { value, tone = "neutral" } = props;

  const colors =
    tone === "good"
      ? { bg: "#ecfdf3", fg: "#166534", border: "#bbf7d0" }
      : tone === "warn"
        ? { bg: "#fff7ed", fg: "#b54708", border: "#fed7aa" }
        : { bg: "#f8fafc", fg: "#475569", border: "#dbe4ef" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {value || "—"}
    </span>
  );
}

function complianceTone(value: string | null | undefined) {
  return value === "Compliant" ? "good" : "warn";
}

function inviteTone(value: string | null | undefined) {
  return value === "Linked" || value === "Invited" ? "good" : "neutral";
}

export default function RosterTable(props: Props) {
  const { rows, onManagePerson } = props;

  if (rows.length === 0) {
    return <p className="value-card__body">No roster records match the current view.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 920,
        }}
      >
        <thead>
          <tr>
            {["Name", "Email", "Phone", "Role", "Status", "Invite", "Compliance"].map(
              (label) => (
                <th
                  key={label}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "1px solid #d6dfeb",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#5c6b84",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.roster_member_id}
              tabIndex={0}
              role="button"
              onClick={() => onManagePerson?.(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onManagePerson?.(row);
                }
              }}
              style={{ cursor: "pointer" }}
              title="Open person record"
            >
              <td style={cellStyle}>
                <strong>{row.full_name}</strong>
              </td>
              <td style={cellStyle}>{row.email ?? "—"}</td>
              <td style={cellStyle}>{row.phone ?? "—"}</td>
              <td style={cellStyle}>{row.worker_type ?? "—"}</td>
              <td style={cellStyle}>
                <Pill value={row.employment_status} />
              </td>
              <td style={cellStyle}>
                <Pill value={row.invite_status} tone={inviteTone(row.invite_status)} />
              </td>
              <td style={cellStyle}>
                <Pill
                  value={row.compliance_summary}
                  tone={complianceTone(row.compliance_summary)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
