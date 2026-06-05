"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLob } from "@/features/lob/hooks/useLob";
import RosterSummaryStrip from "@/features/people/components/RosterSummaryStrip";
import RosterControlsBar, {
  type RosterTab,
} from "@/features/people/components/RosterControlsBar";
import RosterTable from "@/features/people/components/RosterTable";
import type { RosterRow } from "@/features/people/types/roster.types";

type ApiRosterRow = {
  roster_member_id: string;
  profile_id?: string | null;
  person_id?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  worker_type: string | null;
  employment_status: "Active" | "Candidate" | "Former" | null;
  market_code: string | null;
  reports_to_name: string | null;
  hire_date: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
  fx_id?: string | null;
  dswid?: string | null;
};

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
          tone === "error"
            ? "1px solid rgba(198,40,40,0.2)"
            : "1px solid rgba(15,159,110,0.2)",
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
            roster_member_id: row.roster_member_id,
            profile_id: row.profile_id ?? null,
            person_id: row.person_id ?? null,
            full_name: row.full_name ?? "Unknown",
            email: row.email ?? null,
            phone: row.phone ?? null,
            worker_type: row.worker_type ?? "Unassigned",
            employment_status: row.employment_status ?? "Candidate",
            market_code: row.market_code ?? "—",
            reports_to_name: row.reports_to_name ?? "—",
            hire_date: row.hire_date ?? "—",
            invite_status: row.invite_status ?? "Not Invited",
            compliance_summary: row.compliance_summary ?? "Missing",
            fx_id: row.fx_id ?? null,
            dswid: row.dswid ?? null,
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

    if (slug) void loadRoster();

    return () => {
      active = false;
    };
  }, [slug]);

  const filteredRows = useMemo(() => {
    const filteredByTab =
      tab === "all"
        ? rows
        : rows.filter((row) => {
            if (tab === "active") return row.employment_status === "Active";
            if (tab === "candidates") return row.employment_status === "Candidate";
            if (tab === "former") return row.employment_status === "Former";
            return true;
          });

    const q = search.trim().toLowerCase();

    if (!q) return filteredByTab;

    return filteredByTab.filter((row) => {
      return (
        row.full_name.toLowerCase().includes(q) ||
        (row.email ?? "").toLowerCase().includes(q) ||
        (row.phone ?? "").toLowerCase().includes(q) ||
        (row.worker_type ?? "").toLowerCase().includes(q) ||
        (row.market_code ?? "").toLowerCase().includes(q) ||
        (row.reports_to_name ?? "").toLowerCase().includes(q) ||
        (row.invite_status ?? "").toLowerCase().includes(q) ||
        (row.compliance_summary ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, tab]);

  const activeCount = rows.filter((r) => r.employment_status === "Active").length;
  const candidateCount = rows.filter((r) => r.employment_status === "Candidate").length;
  const formerCount = rows.filter((r) => r.employment_status === "Former").length;

  const complianceAlertCount = rows.filter(
    (r) =>
      r.compliance_summary !== "Compliant" &&
      r.compliance_summary !== "Archived"
  ).length;

  const missingInviteEmailCount = rows.filter(
    (r) => !r.email || !r.email.trim()
  ).length;

  return (
    <main className="workspace-shell">
      <section
        style={{
          width: "min(1280px, calc(100% - 32px))",
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

        {error ? <InlineMessage tone="error" message={error} /> : null}

        {!error && missingInviteEmailCount > 0 ? (
          <InlineMessage
            tone="success"
            message={`${missingInviteEmailCount} roster record${missingInviteEmailCount === 1 ? "" : "s"} ${
              missingInviteEmailCount === 1 ? "is" : "are"
            } missing invite email. Use View to add contact info before sending invites.`}
          />
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 14,
            color: "#5c6b84",
          }}
        >
          <span>LOB context active</span>
          <span>Company: {slug}</span>
          <span>Total rostered: {rows.length}</span>
        </div>

        <RosterSummaryStrip
          activeCount={activeCount}
          candidateCount={candidateCount}
          formerCount={formerCount}
          complianceAlertCount={complianceAlertCount}
        />

        <article className="value-card">
          <RosterControlsBar
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
          />
        </article>

        <article className="value-card">
          <p className="value-card__eyebrow">Roster table</p>
          <h3 className="value-card__title">Operational people records</h3>
          <p className="value-card__body">
            Use View to maintain contact info. Invite only becomes available when an email is present.
          </p>

          {loading ? (
            <p className="value-card__body" style={{ marginTop: 12 }}>
              Loading roster...
            </p>
          ) : (
            <div style={{ marginTop: 14 }}>
              <RosterTable
                rows={filteredRows}
                onInviteStatusChange={(rosterId, inviteStatus) => {
                  setRows((current) =>
                    current.map((row) =>
                      row.roster_member_id === rosterId
                        ? { ...row, invite_status: inviteStatus }
                        : row
                    )
                  );
                }}
              />
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
