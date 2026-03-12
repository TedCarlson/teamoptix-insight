"use client";

import Link from "next/link";
import SiteHeader from "@/features/landing/components/SiteHeader";
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
    <article className="value-card">
      <p className="value-card__eyebrow">Company</p>
      <h3 className="value-card__title">{membership.company_name}</h3>
      <p className="value-card__body">
        {membership.relationship_type} · {membership.membership_status}
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <div className="hero-stat">
          <span className="hero-stat__label">Slug</span>
          <strong>{membership.company_slug}</strong>
        </div>

        <div className="hero-stat">
          <span className="hero-stat__label">Company status</span>
          <strong>{membership.company_status}</strong>
        </div>

        <div className="hero-stat">
          <span className="hero-stat__label">Membership title</span>
          <strong>{membership.title ?? "Not assigned"}</strong>
        </div>

        {isPlatformOwner ? (
          <div className="hero-stat">
            <span className="hero-stat__label">Developer insight</span>
            <strong>{membership.company_id}</strong>
          </div>
        ) : null}
      </div>

      <div className="cta-row" style={{ marginTop: 18 }}>
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
    <main className="landing-page">
      <SiteHeader />

      <section className="hero">
        <div className="hero__grid">
          <section className="hero-card hero-card--primary">
            <p className="eyebrow">Companies</p>
            <h1>Your company directory</h1>
            <p className="lede">
              Select a company workspace to enter the membership experience for
              that company.
            </p>

            <div className="cta-row">
              <Link className="button" href="/profile">
                Back to profile
              </Link>
            </div>
          </section>

          <aside className="hero-card hero-card--secondary">
            <p className="eyebrow">Directory snapshot</p>

            <div className="hero-stat">
              <span className="hero-stat__label">User</span>
              <strong>
                {access.display_name || access.email || "Unknown user"}
              </strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Memberships</span>
              <strong>{memberships.length}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Privilege</span>
              <strong>
                {access.is_platform_owner ? "Platform Owner" : "Standard User"}
              </strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="value-strip">
        {memberships.length > 0 ? (
          <div className="value-grid">
            {memberships.map((membership) => (
              <CompanyCard
                key={`${membership.company_id}:${membership.relationship_type}`}
                membership={membership}
                isPlatformOwner={Boolean(access.is_platform_owner)}
              />
            ))}
          </div>
        ) : (
          <div className="value-grid">
            <article className="value-card">
              <p className="value-card__eyebrow">No memberships</p>
              <h3 className="value-card__title">No company access yet</h3>
              <p className="value-card__body">
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
          </div>
        )}
      </section>
    </main>
  );
}