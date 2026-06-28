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

function CompanyCard(props: {
  membership: Membership;
  isPlatformOwner: boolean;
}) {
  const { membership, isPlatformOwner } = props;

  return (
    <article className="app-card" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <p className="value-card__eyebrow">Company</p>
        <h3 className="app-card__title">{membership.company_name}</h3>
        <p className="app-card__body">
          {membership.relationship_type} · {membership.membership_status}
        </p>
      </div>

      <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
        <div>
          <strong>Slug:</strong> {membership.company_slug}
        </div>
        <div>
          <strong>Status:</strong> {membership.company_status}
        </div>
        <div>
          <strong>Title:</strong> {membership.title ?? "Not assigned"}
        </div>
        {isPlatformOwner ? (
          <div>
            <strong>Company ID:</strong> {membership.company_id}
          </div>
        ) : null}
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

  return (
    <main className="directory-shell">
      <section className="directory-main">
        <header className="directory-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">Companies</p>
            <h1 className="directory-title">Choose a workspace</h1>
            <p className="directory-subtitle">
              Select a company to enter its operational workspace.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href="/profile">
              Back to profile
            </Link>
          </div>
        </header>

        <section className="summary-grid">
          <article className="app-card">
            <p className="value-card__eyebrow">User</p>
            <h3 className="app-card__title">
              {access.display_name || access.email || "Unknown user"}
            </h3>
          </article>

          <article className="app-card">
            <p className="value-card__eyebrow">Memberships</p>
            <h3 className="app-card__title">{memberships.length}</h3>
          </article>

          <article className="app-card">
            <p className="value-card__eyebrow">Privilege</p>
            <h3 className="app-card__title">
              {access.is_platform_owner ? "Platform Owner" : "Standard User"}
            </h3>
          </article>
        </section>

        {memberships.length > 0 ? (
          <section className="directory-grid">
            {memberships.map((membership) => (
              <CompanyCard
                key={`${membership.company_id}:${membership.relationship_type}`}
                membership={membership}
                isPlatformOwner={Boolean(access.is_platform_owner)}
              />
            ))}
          </section>
        ) : (
          <section className="directory-grid">
            <article className="app-card">
              <p className="value-card__eyebrow">No memberships</p>
              <h3 className="app-card__title">No company access yet</h3>
              <p className="app-card__body">
                This account does not currently have any company memberships.
              </p>

              <div className="cta-row" style={{ marginTop: 18 }}>
                {access.is_platform_owner ? (
                  <Link className="button button-primary" href="/company/setup">
                    Create company
                  </Link>
                ) : null}

                <Link className="button" href="/profile">
                  Back to profile
                </Link>
              </div>
            </article>
          </section>
        )}
      </section>
    </main>
  );
}
