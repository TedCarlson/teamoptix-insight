"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLob } from "@/features/lob/hooks/useLob";
import RosterSummaryStrip from "@/features/people/components/RosterSummaryStrip";
import RosterControlsBar, {
  type RosterTab,
} from "@/features/people/components/RosterControlsBar";

type RosterRow = {
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

type ApiRosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: "Active" | "Candidate" | "Former" | null;
  market_code: string | null;
  reports_to_name: string | null;
  hire_date: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
};

async function sendInvite(slug: string, rosterId: string) {
  const res = await fetch(
    `/api/company/${slug}/people/roster/${rosterId}/invite`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error ?? "Failed to send invite.");
  }

  return data;
}

function InlineMessage(props: {
  tone: "error" | "success";
  message: string;
}) {
  const { tone, message } = props;

  return (
    <div
      className="value-card"
      style={{
        gridColumn: "1 / -1",
        padding: "12px 16px",
        border:
          tone === "error" ? "1px solid rgba(198,40,40,0.2)" : "1px solid rgba(15,159,110,0.2)",
      }}
    >
      <p
        style={{
          margin: 0,
          color: tone === "error" ? "#c62828" : "#0f9f6e",
          fontWeight: 600,
        }}
      >
        {message}
      </p>
    </div>
  );
}

export default function CompanyRosterPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const lob = useLob();

  const [tab, setTab] = useState<RosterTab>("active");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [invitingRosterId, setInvitingRosterId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRoster() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load roster.");
          setRows([]);
          return;
        }

        const normalized: RosterRow[] = ((data?.roster ?? []) as ApiRosterRow[]).map(
          (row) => ({
            id: row.roster_member_id,
            full_name: row.full_name ?? "Unknown",
            worker_type: row.worker_type ?? "Unassigned",
            status: row.employment_status ?? "Candidate",
            market: row.market_code ?? "—",
            reports_to: row.reports_to_name ?? "—",
            start_date: row.hire_date ?? "—",
            invite_status: row.invite_status ?? "Not Invited",
            compliance: row.compliance_summary ?? "Missing",
          })
        );

        setRows(normalized);
      } catch {
        if (!active) return;
        setError("Roster request failed.");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) loadRoster();

    return () => {
      active = false;
    };
  }, [slug]);

  async function handleInvite(rosterId: string, fullName: string) {
    try {
      setInvitingRosterId(rosterId);
      setInviteError(null);
      setInviteMessage(null);

      const result = await sendInvite(slug, rosterId);
      const nextInviteStatus = String(result?.invite_status ?? "Invited");

      setRows((prev) =>
        prev.map((row) =>
          row.id === rosterId ? { ...row, invite_status: nextInviteStatus } : row
        )
      );

      setInviteMessage(`Invite sent for ${fullName}.`);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invite."
      );
    } finally {
      setInvitingRosterId(null);
    }
  }

  const filteredRows = useMemo(() => {
    const filteredByTab =
      tab === "all"
        ? rows
        : rows.filter((row) => {
            if (tab === "active") return row.status === "Active";
            if (tab === "candidates") return row.status === "Candidate";
            if (tab === "former") return row.status === "Former";
            return true;
          });

    const q = search.trim().toLowerCase();

    if (!q) return filteredByTab;

    return filteredByTab.filter((row) => {
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.worker_type.toLowerCase().includes(q) ||
        row.market.toLowerCase().includes(q) ||
        row.reports_to.toLowerCase().includes(q) ||
        row.invite_status.toLowerCase().includes(q) ||
        row.compliance.toLowerCase().includes(q)
      );
    });
  }, [rows, search, tab]);

  const activeCount = rows.filter((r) => r.status === "Active").length;
  const candidateCount = rows.filter((r) => r.status === "Candidate").length;
  const formerCount = rows.filter((r) => r.status === "Former").length;

  const complianceAlertCount = rows.filter(
    (r) => r.compliance !== "Compliant" && r.compliance !== "Archived"
  ).length;

  return (
    <main className="landing-page">
      <section
        style={{
          width: "min(1200px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "28px 0 12px",
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <p className="eyebrow">People</p>
            <h1 style={{ margin: 0 }}>Roster</h1>
            <p className="lede" style={{ margin: 0, maxWidth: 760 }}>
              Manage active, candidate, and former people records from one operational surface.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href={`/company/${slug}/people`}>
              Back to people
            </Link>
            <button className="button button-primary" type="button">
              Add person
            </button>
            <Link className="button" href={`/company/${slug}/people/import`}>
              Import roster
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 14,
            color: "#5c6b84",
          }}
        >
          <span>
            <strong>LOB:</strong> {lob.lob_label}
          </span>
          <span>
            <strong>Industry:</strong> {lob.industry_label}
          </span>
        </div>
      </section>

      <RosterSummaryStrip
        activeCount={activeCount}
        candidateCount={candidateCount}
        formerCount={formerCount}
        complianceAlertCount={complianceAlertCount}
      />

      <section className="value-strip" style={{ paddingTop: 16 }}>
        <div className="value-grid">
          {error ? <InlineMessage tone="error" message={error} /> : null}
          {inviteError ? <InlineMessage tone="error" message={inviteError} /> : null}
          {inviteMessage ? <InlineMessage tone="success" message={inviteMessage} /> : null}

          <article style={{ gridColumn: "1 / -1" }}>
            <RosterControlsBar
              tab={tab}
              setTab={setTab}
              search={search}
              setSearch={setSearch}
            />
          </article>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            {loading ? (
              <div style={{ padding: 24 }}>Loading roster...</div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: 24 }}>
                No roster records match the current view.
              </div>
            ) : (
              <div style={{ marginTop: 4, overflowX: "auto" }}>
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
                    {filteredRows.map((row) => {
                      let viewHref: string | null = null;

                      if (row.status === "Candidate") {
                        viewHref = `/company/${slug}/hiring/candidate/${row.id}`;
                      } else if (row.status === "Active") {
                        viewHref = `/company/${slug}/people/active/${row.id}`;
                      }

                      const inviteDisabled =
                        row.status === "Former" ||
                        row.invite_status === "Invited" ||
                        invitingRosterId === row.id;

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
                              {viewHref ? (
                                <Link className="button" href={viewHref}>
                                  View
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  className="button"
                                  disabled
                                  title="Former detail surface is next."
                                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                                >
                                  View
                                </button>
                              )}

                              <button
                                type="button"
                                className="button"
                                disabled={inviteDisabled}
                                onClick={() => handleInvite(row.id, row.full_name)}
                              >
                                {invitingRosterId === row.id
                                  ? "Sending..."
                                  : row.invite_status === "Invited"
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
            )}
          </article>
        </div>
      </section>
    </main>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};