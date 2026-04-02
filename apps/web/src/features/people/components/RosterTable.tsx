"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";

type Props = {
  rows: RosterRow[];
  onInviteStatusChange?: (rosterId: string, inviteStatus: string) => void;
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};

function resolveViewHref(slug: string, row: RosterRow) {
  if (row.employment_status === "Active") {
    return `/company/${slug}/people/active/${row.roster_member_id}`;
  }

  if (row.employment_status === "Former") {
    return `/company/${slug}/people/former/${row.roster_member_id}`;
  }

  return `/company/${slug}/hiring/candidate/${row.roster_member_id}`;
}

export default function RosterTable(props: Props) {
  const { rows, onInviteStatusChange } = props;
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStatusById, setInviteStatusById] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    setInviteStatusById(
      Object.fromEntries(
        rows.map((row) => [row.roster_member_id, row.invite_status || "Not Invited"])
      )
    );
  }, [rows]);

  const normalizedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        current_invite_status:
          inviteStatusById[row.roster_member_id] ?? row.invite_status ?? "Not Invited",
      })),
    [rows, inviteStatusById]
  );

  async function handleInvite(row: RosterRow) {
    try {
      setInviteError(null);
      setInviteBusyId(row.roster_member_id);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${row.roster_member_id}/invite`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setInviteError(data?.error ?? `Failed to invite ${row.full_name}.`);
        return;
      }

      const nextInviteStatus = String(data?.invite_status ?? "Invited");

      setInviteStatusById((current) => ({
        ...current,
        [row.roster_member_id]: nextInviteStatus,
      }));

      onInviteStatusChange?.(row.roster_member_id, nextInviteStatus);
    } catch {
      setInviteError(`Failed to invite ${row.full_name}.`);
    } finally {
      setInviteBusyId(null);
    }
  }

  if (normalizedRows.length === 0) {
    return (
      <div>
        <p className="value-card__body">No roster records match the current view.</p>
        <div className="cta-row" style={{ marginTop: 14 }}>
          <button className="button button-primary" type="button">
            Add person
          </button>
          <Link className="button" href={`/company/${slug}/people/import`}>
            Import roster
          </Link>
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
          minWidth: 1220,
        }}
      >
        <thead>
          <tr>
            {[
              "Name",
              "Email",
              "Phone",
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
          {normalizedRows.map((row) => {
            const viewHref = resolveViewHref(slug, row);
            const inviteBusy = inviteBusyId === row.roster_member_id;
            const inviteStatus = row.current_invite_status;
            const hasEmail = Boolean(row.email && row.email.trim());
            const inviteDisabled =
              inviteBusy ||
              !hasEmail ||
              inviteStatus.toLowerCase() === "invited" ||
              inviteStatus.toLowerCase() === "linked";

            return (
              <tr key={row.roster_member_id}>
                <td style={cellStyle}>{row.full_name}</td>
                <td style={cellStyle}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <strong style={{ fontWeight: 600 }}>
                      {row.email ?? "—"}
                    </strong>
                    {!hasEmail ? (
                      <span style={{ color: "#b26a00", fontSize: 12 }}>
                        Missing invite email
                      </span>
                    ) : null}
                  </div>
                </td>
                <td style={cellStyle}>{row.phone ?? "—"}</td>
                <td style={cellStyle}>{row.worker_type ?? "—"}</td>
                <td style={cellStyle}>{row.employment_status}</td>
                <td style={cellStyle}>{row.market_code ?? "—"}</td>
                <td style={cellStyle}>{row.reports_to_name ?? "—"}</td>
                <td style={cellStyle}>{row.hire_date ?? "—"}</td>
                <td style={cellStyle}>{inviteStatus}</td>
                <td style={cellStyle}>{row.compliance_summary ?? "—"}</td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link className="button" href={viewHref}>
                      View
                    </Link>

                    <button
                      type="button"
                      className="button"
                      disabled={inviteDisabled}
                      onClick={() => void handleInvite(row)}
                      title={
                        !hasEmail
                          ? "Add an email on the detail page before inviting."
                          : inviteStatus.toLowerCase() === "linked"
                            ? "This person is already linked."
                            : undefined
                      }
                      style={
                        inviteDisabled
                          ? { opacity: 0.6, cursor: "not-allowed" }
                          : undefined
                      }
                    >
                      {inviteBusy
                        ? "Inviting..."
                        : !hasEmail
                          ? "Need Email"
                          : inviteStatus.toLowerCase() === "linked"
                            ? "Linked"
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
