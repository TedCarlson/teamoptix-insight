"use client";

import Link from "next/link";
import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";
import ValueCard from "@/features/landing/components/ValueCard";

export default function HomePage() {
  const access = useAccess();

  const signedIn = Boolean(access.auth_user_id);
  const hasProfile = Boolean(access.profile_id);
  const membershipCount = access.memberships.length;
  const canCreateCompany = Boolean(access.is_platform_owner);

  const primaryHref = !signedIn
    ? "/sign-in"
    : !hasProfile
      ? "/profile/setup"
      : membershipCount > 0
        ? "/companies"
        : "/profile";

  const primaryLabel = !signedIn
    ? "Sign in"
    : !hasProfile
      ? "Complete profile"
      : membershipCount > 0
        ? "Go to companies"
        : "Go to profile";

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
              <Link className="button button-primary" href={primaryHref}>
                {primaryLabel}
              </Link>

              {signedIn && membershipCount > 0 ? (
                <Link className="button" href="/companies">
                  Company directory
                </Link>
              ) : null}

              {signedIn && membershipCount === 0 && canCreateCompany ? (
                <Link className="button" href="/company/setup">
                  Create company
                </Link>
              ) : null}

              {!signedIn ? (
                <Link className="button" href="/profile/setup">
                  Create profile
                </Link>
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
              <span className="hero-stat__label">Current state</span>
              <strong>
                {!signedIn
                  ? "Signed out"
                  : membershipCount > 0
                    ? "Company context available"
                    : "No company memberships yet"}
              </strong>
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
            eyebrow="Governance"
            title="Owner-gated creation"
            body="Company creation is controlled intentionally instead of being open to every signed-in user."
          />
        </div>
      </section>
    </main>
  );
}