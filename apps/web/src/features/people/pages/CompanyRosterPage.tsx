"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ManagePersonDrawer from "@/features/people/components/ManagePersonDrawer";
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

function normalizeRosterRow(row: ApiRosterRow): RosterRow {
  return {
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
  };
}

function StatCard(props: { label: string; value: number }) {
  return (
    <div className="hero-stat">
      <span className="hero-stat__label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export default function CompanyRosterPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [tab, setTab] = useState<RosterTab>("active");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [managedPerson, setManagedPerson] = useState<RosterRow | null>(null);
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

        setRows(((data?.roster ?? []) as ApiRosterRow[]).map(normalizeRosterRow));
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
    const byTab =
      tab === "all"
        ? rows
        : rows.filter((row) => {
            if (tab === "active") return row.employment_status === "Active";
            if (tab === "candidates") return row.employment_status === "Candidate";
            if (tab === "former") return row.employment_status === "Former";
            return true;
          });

    const q = search.trim().toLowerCase();
    if (!q) return byTab;

    return byTab.filter((row) =>
      [
        row.full_name,
        row.email,
        row.phone,
        row.worker_type,
        row.market_code,
        row.reports_to_name,
        row.invite_status,
        row.compliance_summary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search, tab]);

  const activeCount = rows.filter((r) => r.employment_status === "Active").length;
  const candidateCount = rows.filter((r) => r.employment_status === "Candidate").length;
  const formerCount = rows.filter((r) => r.employment_status === "Former").length;
  const complianceAlertCount = rows.filter(
    (r) => r.compliance_summary !== "Compliant"
  ).length;

  return (
    <main className="landing-page">
      <section
        style={{
          width: "min(1440px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "28px 0 32px",
          display: "grid",
          gap: 16,
        }}
      >
        {error ? (
          <article className="value-card" style={{ padding: 14 }}>
            <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>
              {error}
            </p>
          </article>
        ) : null}

        <article className="value-card">
          <RosterControlsBar
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
            counts={{
              active: activeCount,
              candidates: candidateCount,
              former: formerCount,
              all: rows.length,
              complianceAlerts: complianceAlertCount,
            }}
          />
        </article>

        <article className="value-card" style={{ padding: 18, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <p className="value-card__eyebrow">Roster table</p>
              <h3 className="value-card__title">Operational people records</h3>
              <p className="value-card__body">
                Use Manage to update details, status, invite posture, compliance, and lifecycle history.
              </p>
            </div>

            <button className="button button-primary" type="button">
              Add person
            </button>
          </div>

          {loading ? (
            <p className="value-card__body">Loading roster...</p>
          ) : (
            <RosterTable rows={filteredRows} onManagePerson={setManagedPerson} />
          )}
        </article>

        <ManagePersonDrawer
          open={Boolean(managedPerson)}
          person={managedPerson}
          onClose={() => setManagedPerson(null)}
        />
      </section>
    </main>
  );
}
