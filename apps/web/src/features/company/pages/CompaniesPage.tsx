"use client";

import Link from "next/link";
import { useAccess } from "@/features/access/AccessProvider";

type Membership = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  relationship_type: string;
  membership_status: string;
  title: string | null;
};

function label(value: string | null | undefined) {
  if (!value) return "Not assigned";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function CompanyCard(props: { membership: Membership }) {
  const { membership } = props;

  return (
    <article className="app-card" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <p className="value-card__eyebrow">Company</p>
        <h3 className="app-card__title">{membership.company_name}</h3>
        <p className="app-card__body">
          {label(membership.relationship_type)} · {label(membership.membership_status)}
        </p>
      </div>

      <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
        <div>
          <strong>Role:</strong> {membership.title ?? label(membership.relationship_type)}
        </div>
        <div>
          <strong>Workspace status:</strong> {label(membership.company_status)}
        </div>
      </div>

      <div className="cta-row" style={{ marginTop: 4 }}>
        <Link
          className="button button-primary"
          href={`/company/${membership.company_slug}`}
        >
          Enter workspace
        </Link>
      </div>
    </article>
  );
}

export default function CompaniesPage() {
  const access = useAccess();
  const memberships = (access.memberships ?? []) as Membership[];
  const backHref = access.is_platform_owner ? "/teamoptix/command-center" : "/profile";
  const backLabel = access.is_platform_owner ? "Back to TeamOptix" : "Back to My Workspace";

  return (
    <main className="directory-shell">
      <section className="directory-main">
        <header className="directory-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">Directory</p>
            <h1 className="directory-title">Company Directory</h1>
            <p className="directory-subtitle">
              Enter an authorized company workspace.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href={backHref}>
              {backLabel}
            </Link>
          </div>
        </header>

        {memberships.length > 0 ? (
          <section className="directory-grid">
            {memberships.map((membership) => (
              <CompanyCard
                key={`${membership.company_id}:${membership.relationship_type}`}
                membership={membership}
              />
            ))}
          </section>
        ) : (
          <section className="directory-grid">
            <article className="app-card">
              <p className="value-card__eyebrow">No access</p>
              <h3 className="app-card__title">No company workspaces yet</h3>
              <p className="app-card__body">
                Company access will appear here after an invitation or membership is active.
              </p>

              <div className="cta-row" style={{ marginTop: 18 }}>
                <Link className="button" href={backHref}>
                  {backLabel}
                </Link>
              </div>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}
