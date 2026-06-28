"use client";

import Link from "next/link";
import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";
import PlatformPillarCard from "@/features/platform/components/PlatformPillarCard";

export default function CommandCenterPage() {
  const access = useAccess();

  const name =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "Platform Owner";

  const membershipCount = access.memberships.length;

  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main">
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
            <p className="eyebrow">TeamOptix Platform</p>
            <h1 className="workspace-title">Insight Command Center</h1>
            <p className="workspace-subtitle">
              Run Insight from one place. Monitor company access, commercial readiness,
              platform configuration, and the owner-level work needed to operate the system.
            </p>

            <div className="cta-row">
              <Link className="button button-primary" href="/companies">
                Manage companies
              </Link>
              <Link className="button" href="/commercial">
                Commercial
              </Link>
              <Link className="button" href="/configuration">
                Configuration
              </Link>
            </div>
          </div>

          <aside className="context-grid">
            <div className="context-stat">
              <span className="context-stat__label">Owner</span>
              <strong>{access.loading ? "Loading" : name}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Platform role</span>
              <strong>{access.is_platform_owner ? "Platform Owner" : "Standard User"}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Companies</span>
              <strong>{membershipCount}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Commercial layer</span>
              <strong>Scaffolded</strong>
            </div>
          </aside>
        </header>

        <section className="summary-grid">
          <PlatformPillarCard
            eyebrow="Mission Control"
            title="Platform Status"
            body="Initial owner surface is in place. Health signals can be wired here without touching company workspaces."
          />

          <PlatformPillarCard
            eyebrow="Customer Layer"
            title="Companies"
            body="Customer organizations remain the primary operating boundary for workspaces, users, and modules."
            href="/companies"
            actionLabel="Open companies"
          />

          <PlatformPillarCard
            eyebrow="Commercial Layer"
            title="Billing Foundation"
            body="Plans, trials, billing status, subscriptions, and Stripe references now have a permanent home."
            href="/commercial"
            actionLabel="Open commercial"
          />
        </section>

        <section className="workspace-grid">
          <PlatformPillarCard
            eyebrow="Platform"
            title="Command Center"
            body="The platform owner landing page. This is above customer context and represents TeamOptix operating Insight."
          />

          <PlatformPillarCard
            eyebrow="Companies"
            title="Customer Directory"
            body="Every customer workspace, company status, and company relationship belongs here."
            href="/companies"
          />

          <PlatformPillarCard
            eyebrow="Commercial"
            title="Revenue Operations"
            body="The place for subscriptions, pricing tiers, trials, renewals, invoices, and payment provider references."
            href="/commercial"
          />

          <PlatformPillarCard
            eyebrow="Configuration"
            title="Platform DNA"
            body="Feature flags, modules, industries, templates, policies, and platform behavior live here."
            href="/configuration"
          />
        </section>
      </section>
    </main>
  );
}
