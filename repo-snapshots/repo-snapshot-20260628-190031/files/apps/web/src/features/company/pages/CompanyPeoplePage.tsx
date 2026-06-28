"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type RosterMetricRow = {
  employment_status?: string | null;
  invite_status?: string | null;
  compliance_summary?: string | null;
  reports_to_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function MetricCard(props: {
  eyebrow: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  const { eyebrow, title, body, href, cta } = props;

  return (
    <article className="app-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="app-card__title">{title}</h3>
      <p className="app-card__body">{body}</p>

      {href && cta ? (
        <div className="cta-row" style={{ marginTop: 14 }}>
          <Link className="button button-primary" href={href}>
            {cta}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export default function CompanyPeoplePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [rows, setRows] = useState<RosterMetricRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPeopleSignals() {
      try {
        setLoading(true);

        const res = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        const nextRows =
          Array.isArray(data?.rows)
            ? data.rows
            : Array.isArray(data?.roster)
              ? data.roster
              : Array.isArray(data?.people)
                ? data.people
                : [];

        setRows(nextRows as RosterMetricRow[]);
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void loadPeopleSignals();

    return () => {
      active = false;
    };
  }, [slug]);

  const metrics = useMemo(() => {
    const active = rows.filter((row) => row.employment_status === "Active").length;
    const candidates = rows.filter((row) => row.employment_status === "Candidate").length;
    const former = rows.filter((row) => row.employment_status === "Former").length;
    const pendingInvites = rows.filter((row) =>
      ["Not Invited", "Invited", "Pending"].includes(row.invite_status ?? "")
    ).length;
    const complianceFlags = rows.filter((row) => {
      const value = (row.compliance_summary ?? "").toLowerCase();
      return value.includes("missing") || value.includes("expired") || value.includes("incomplete");
    }).length;
    const profileFlags = rows.filter(
      (row) => !row.email || !row.phone || !row.reports_to_name
    ).length;

    return {
      active,
      candidates,
      former,
      pendingInvites,
      complianceFlags,
      profileFlags,
    };
  }, [rows]);

  return (
    <main className="workspace-shell">
      <section className="workspace-main">
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">People</p>
            <h1 className="workspace-title">People workspace</h1>
            <p className="workspace-subtitle">
              Review workforce posture, profile gaps, compliance signals, and invitation work before choosing the next action.
            </p>
          </div>

          <div className="context-grid">
            <div className="context-stat">
              <span className="context-stat__label">Active workforce</span>
              <strong>{loading ? "Loading" : metrics.active}</strong>
            </div>
            <div className="context-stat">
              <span className="context-stat__label">Candidates</span>
              <strong>{loading ? "Loading" : metrics.candidates}</strong>
            </div>
            <div className="context-stat">
              <span className="context-stat__label">Pending invites</span>
              <strong>{loading ? "Loading" : metrics.pendingInvites}</strong>
            </div>
            <div className="context-stat">
              <span className="context-stat__label">Profile flags</span>
              <strong>{loading ? "Loading" : metrics.profileFlags}</strong>
            </div>
          </div>
        </header>

        <section className="summary-grid">
          <MetricCard
            eyebrow="Workforce"
            title={`${metrics.active} active`}
            body={`${metrics.candidates} candidates · ${metrics.former} former records`}
            href={`/company/${slug}/people/roster`}
            cta="Open roster"
          />

          <MetricCard
            eyebrow="Compliance"
            title={`${metrics.complianceFlags} signals`}
            body="Missing, incomplete, or expired document posture will surface here as compliance matures."
          />

          <MetricCard
            eyebrow="Invitations"
            title={`${metrics.pendingInvites} pending`}
            body="Track workers who still need to connect their profile to the company workspace."
          />
        </section>

        <section className="workspace-grid">
          <MetricCard
            eyebrow="Profile quality"
            title={`${metrics.profileFlags} records need review`}
            body="Missing email, phone, or reporting alignment can reduce workforce visibility."
            href={`/company/${slug}/people/roster`}
            cta="Review people"
          />

          <MetricCard
            eyebrow="Imports"
            title="Bulk workforce updates"
            body="Upload and review current or former employee records before commit."
          />

          <MetricCard
            eyebrow="Hiring posture"
            title={`${metrics.candidates} candidates`}
            body="Candidate records are visible from the workforce spine while the hiring workflow matures."
            href={`/company/${slug}/hiring`}
            cta="Open hiring"
          />

          <MetricCard
            eyebrow="Recent activity"
            title="Activity feed pending"
            body="Roster imports, accepted invites, profile updates, and status changes will land here."
          />
        </section>
      </section>
    </main>
  );
}
