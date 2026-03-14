"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export type RosterRow = {
  id: string;
  full_name: string;
  worker_type: string;
  status: "Active" | "Candidate" | "Former";
  market: string;
  reports_to: string;
  start_date: string;
  invite_status: string;
  compliance: string;
};

type Props = {
  rows: RosterRow[];
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};

export default function RosterTable(props: Props) {
  const { rows } = props;
  const params = useParams();
  const slug = String(params?.slug ?? "");

  if (rows.length === 0) {
    return (
      <div>
        <p className="value-card__body">No roster records match the current view.</p>
        <div className="cta-row" style={{ marginTop: 14 }}>
          <button className="button button-primary" type="button">
            Add person
          </button>
          <button className="button" type="button">
            Import roster
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 980,
        }}
      >
        <thead>
          <tr>
            {[
              "Name",
              "Worker Type",
              "Status",
              "Market",
              "Reports To",
              "Start Date",
              "Invite Status",
              "Compliance",
              "Actions",
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
          {rows.map((row) => {
            const isCandidate = row.status === "Candidate";
            const candidateHref = `/company/${slug}/hiring/candidate/${row.id}`;

            return (
              <tr key={row.id}>
                <td style={cellStyle}>{row.full_name}</td>
                <td style={cellStyle}>{row.worker_type}</td>
                <td style={cellStyle}>{row.status}</td>
                <td style={cellStyle}>{row.market}</td>
                <td style={cellStyle}>{row.reports_to}</td>
                <td style={cellStyle}>{row.start_date}</td>
                <td style={cellStyle}>{row.invite_status}</td>
                <td style={cellStyle}>{row.compliance}</td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {isCandidate ? (
                      <Link className="button" href={candidateHref}>
                        View
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="button"
                        disabled
                        title="Status-aware View for Active and Former is next."
                        style={{ opacity: 0.6, cursor: "not-allowed" }}
                      >
                        View
                      </button>
                    )}

                    <button type="button" className="button">
                      Invite
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}