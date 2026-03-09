"use client";

import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";

function StatusCard(props: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const { eyebrow, title, body } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      <p className="value-card__body">{body}</p>
    </article>
  );
}

export default function ProfilePage() {
  const access = useAccess();

  const name =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "User";

  const membershipCount = access.memberships?.length ?? 0;

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="hero">
        <div className="hero__grid">
          <section className="hero-card hero-card--primary">
            <p className="eyebrow">Profile</p>
            <h1>{access.loading ? "Loading" : name}</h1>
            <p className="lede">
              Signed-in checkpoint surface for reviewing identity, profile state,
              and next actions without forcing workflow progression.
            </p>

            <div className="cta-row">
              <a className="button button-primary" href="/company/setup">
                Create company
              </a>
              <a className="button" href="/">
                Back to home
              </a>
            </div>
          </section>

          <aside className="hero-card hero-card--secondary">
            <p className="eyebrow">Access snapshot</p>

            <div className="hero-stat">
              <span className="hero-stat__label">Email</span>
              <strong>{access.email ?? "Not available"}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Profile status</span>
              <strong>{access.profile_status ?? "Unknown"}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Role posture</span>
              <strong>
                {access.is_platform_owner ? "Platform Owner" : "Standard User"}
              </strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="value-strip">
        <div className="value-grid">
          <StatusCard
            eyebrow="Identity"
            title={access.profile_id ? "Profile exists" : "Profile missing"}
            body={
              access.profile_id
                ? "Your platform identity is active and resolving through access context."
                : "Your platform profile has not been resolved yet."
            }
          />

          <StatusCard
            eyebrow="Memberships"
            title={`${membershipCount} company ${membershipCount === 1 ? "membership" : "memberships"}`}
            body={
              membershipCount > 0
                ? "You already have company context available in the platform."
                : "You do not belong to a company yet."
            }
          />

          <StatusCard
            eyebrow="Next step"
            title={membershipCount > 0 ? "Continue platform flow" : "Create or join a company"}
            body={
              membershipCount > 0
                ? "You are ready for the next authenticated application surfaces."
                : "You can create a company now, or return later without being forced forward."
            }
          />
        </div>
      </section>
    </main>
  );
}
