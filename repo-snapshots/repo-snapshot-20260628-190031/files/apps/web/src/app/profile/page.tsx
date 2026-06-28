"use client";

import Link from "next/link";
import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";

function StatusCard(props: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const { eyebrow, title, body } = props;

  return (
    <article className="app-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="app-card__title">{title}</h3>
      <p className="app-card__body">{body}</p>
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

  const membershipCount = access.memberships.length;
  const canCreateCompany = Boolean(access.is_platform_owner);

  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main">
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
            <p className="eyebrow">Profile</p>
            <h1 className="workspace-title">{access.loading ? "Loading" : name}</h1>
            <p className="workspace-subtitle">
              Review your identity, access posture, and available workspaces without forcing onboarding progression.
            </p>

            <div className="cta-row">
              {canCreateCompany ? (
                <Link className="button button-primary" href="/command-center">
                  Open Command Center
                </Link>
              ) : membershipCount > 0 ? (
                <Link className="button button-primary" href="/companies">
                  Go to companies
                </Link>
              ) : null}

              {membershipCount === 0 && canCreateCompany ? (
                <Link className="button" href="/company/setup">
                  Create company
                </Link>
              ) : null}

              <Link className="button" href="/">
                Back to home
              </Link>
            </div>
          </div>

          <aside className="context-grid">
            <div className="context-stat">
              <span className="context-stat__label">Email</span>
              <strong>{access.email ?? "Not available"}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Profile status</span>
              <strong>{access.profile_status ?? "Unknown"}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Role posture</span>
              <strong>
                {access.is_platform_owner ? "Platform Owner" : "Standard User"}
              </strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Memberships</span>
              <strong>{membershipCount}</strong>
            </div>
          </aside>
        </header>

        <section className="summary-grid">
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
            eyebrow="Company access"
            title={
              membershipCount > 0
                ? "Directory available"
                : canCreateCompany
                  ? "Owner-gated access granted"
                  : "Restricted to platform owner"
            }
            body={
              membershipCount > 0
                ? "Use the company directory to enter a workspace and inspect modules."
                : canCreateCompany
                  ? "You can provision the first company workspace from this account."
                  : "Company creation is intentionally gated and not available from this account."
            }
          />
        </section>
      </section>
    </main>
  );
}
