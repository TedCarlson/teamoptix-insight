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
    <article className="value-card" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <p className="value-card__eyebrow">Company</p>
        <h3 className="value-card__title">{membership.company_name}</h3>
        <p className="value-card__body">
          {membership.relationship_type} · {membership.membership_status}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          fontSize: 14,
        }}
      >
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

function DirectorySummary(props: {
  userLabel: string;
  membershipCount: number;
  isPlatformOwner: boolean;
}) {
  const { userLabel, membershipCount, isPlatformOwner } = props;

  return (
    <section
      className="value-strip"
      style={{ paddingTop: 0, paddingBottom: 0, marginTop: 12 }}
    >
      <div
        className="value-grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <article className="value-card" style={{ padding: 16 }}>
          <p className="value-card__eyebrow">User</p>
          <h3 className="value-card__title" style={{ fontSize: "1rem" }}>
            {userLabel}
          </h3>
        </article>

        <article className="value-card" style={{ padding: 16 }}>
          <p className="value-card__eyebrow">Memberships</p>
          <h3 className="value-card__title" style={{ fontSize: "1rem" }}>
            {membershipCount}
          </h3>
        </article>

        <article className="value-card" style={{ padding: 16 }}>
          <p className="value-card__eyebrow">Privilege</p>
          <h3 className="value-card__title" style={{ fontSize: "1rem" }}>
            {isPlatformOwner ? "Platform Owner" : "Standard User"}
          </h3>
        </article>
      </div>
    </section>
  );
}

export default function CompaniesPage() {
  const access = useAccess();
  const memberships = (access.memberships ?? []) as Membership[];

  return (
    <main className="landing-page">
      <section
        style={{
          width: "min(1120px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "32px 0 16px",
          display: "grid",
          gap: 16,
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
            <p className="eyebrow">Companies</p>
            <h1 style={{ margin: 0 }}>Choose a workspace</h1>
            <p className="lede" style={{ margin: 0, maxWidth: 720 }}>
              Select a company to enter its operational workspace.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href="/profile">
              Back to profile
            </Link>
          </div>
        </div>
      </section>

      <DirectorySummary
        userLabel={access.display_name || access.email || "Unknown user"}
        membershipCount={memberships.length}
        isPlatformOwner={Boolean(access.is_platform_owner)}
      />

      <section className="value-strip" style={{ paddingTop: 16 }}>
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