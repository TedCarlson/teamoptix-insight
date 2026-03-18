"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

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

  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [inviteStatusById, setInviteStatusById] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        rows.map((row) => [row.id, row.invite_status || "Not Invited"])
      )
  );
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleInvite(row: RosterRow) {
    try {
      setInviteError(null);
      setInviteBusyId(row.id);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${row.id}/invite`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setInviteError(data?.error ?? `Failed to invite ${row.full_name}.`);
        return;
      }

      setInviteStatusById((current) => ({
        ...current,
        [row.id]: String(data?.invite_status ?? "Invited"),
      }));
    } catch {
      setInviteError(`Failed to invite ${row.full_name}.`);
    } finally {
      setInviteBusyId(null);
    }
  }

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
      {inviteError ? (
        <p style={{ margin: "0 0 12px", color: "#c62828" }}>{inviteError}</p>
      ) : null}

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
            const inviteBusy = inviteBusyId === row.id;
            const inviteStatus = inviteStatusById[row.id] ?? row.invite_status;
            const inviteDisabled =
              inviteBusy ||
              inviteStatus.toLowerCase() === "invited";

            return (
              <tr key={row.id}>
                <td style={cellStyle}>{row.full_name}</td>
                <td style={cellStyle}>{row.worker_type}</td>
                <td style={cellStyle}>{row.status}</td>
                <td style={cellStyle}>{row.market}</td>
                <td style={cellStyle}>{row.reports_to}</td>
                <td style={cellStyle}>{row.start_date}</td>
                <td style={cellStyle}>{inviteStatus}</td>
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

                    <button
                      type="button"
                      className="button"
                      disabled={inviteDisabled}
                      onClick={() => void handleInvite(row)}
                      style={
                        inviteDisabled
                          ? { opacity: 0.6, cursor: "not-allowed" }
                          : undefined
                      }
                    >
                      {inviteBusy
                        ? "Inviting..."
                        : inviteStatus.toLowerCase() === "invited"
                          ? "Invited"
                          : "Invite"}
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