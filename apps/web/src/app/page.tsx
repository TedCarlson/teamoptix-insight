"use client";

import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";
import ValueCard from "@/features/landing/components/ValueCard";

export default function HomePage() {
  const access = useAccess();

  const signedIn = Boolean(access.auth_user_id);
  const hasProfile = Boolean(access.profile_id);
  const hasMemberships = Boolean(access.memberships?.length);

  const primaryHref = !signedIn
    ? "/sign-in"
    : !hasProfile
      ? "/profile/setup"
      : !hasMemberships
        ? "/company/setup"
        : "/company/setup";

  const primaryLabel = !signedIn
    ? "Sign in"
    : !hasProfile
      ? "Complete profile"
      : !hasMemberships
        ? "Create company"
        : "Continue";

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="hero">
        <div className="hero__grid">
          <section className="hero-card hero-card--primary">
            <p className="eyebrow">TeamOptix</p>
            <h1>Insight</h1>
            <p className="lede">
              A modern operations platform built for standalone companies,
              portable user identity, and future-ready multi-industry growth.
            </p>

            <div className="cta-row">
              <a className="button button-primary" href={primaryHref}>
                {primaryLabel}
              </a>

              {!hasProfile ? (
                <a className="button" href="/profile/setup">
                  Create profile
                </a>
              ) : null}

              {!hasMemberships ? (
                <a className="button" href="/company/setup">
                  Create company
                </a>
              ) : null}
            </div>
          </section>

          <aside className="hero-card hero-card--secondary">
            <p className="eyebrow">Platform posture</p>

            <div className="hero-stat">
              <span className="hero-stat__label">Identity</span>
              <strong>One user, many company relationships</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Company model</span>
              <strong>Standalone first, relationships later</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Onboarding</span>
              <strong>Quick-add ready for bulk company adoption</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="value-strip">
        <div className="value-grid">
          <ValueCard
            eyebrow="Company"
            title="Standalone workspace"
            body="Each company gets its own clean starting point inside the platform."
          />
          <ValueCard
            eyebrow="User"
            title="Portable profile"
            body="Users keep one platform identity and move across opportunities cleanly."
          />
          <ValueCard
            eyebrow="Adoption"
            title="Bulk onboarding"
            body="Large groups can be staged quickly through invite and CSV-first paths."
          />
        </div>
      </section>
    </main>
  );
}
