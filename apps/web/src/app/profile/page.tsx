"use client";

import Link from "next/link";
import IdentityPill from "@/features/access/components/IdentityPill";
import { useAccess } from "@/features/access/AccessProvider";

function WorkspaceCard(props: {
  eyebrow: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <article className="app-card">
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h3 className="app-card__title">{props.title}</h3>
      <p className="app-card__body">{props.body}</p>
      {props.action ? <div className="cta-row" style={{ marginTop: 14 }}>{props.action}</div> : null}
    </article>
  );
}

export default function ProfilePage() {
  const access = useAccess();

  const name =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "there";

  const membershipCount = access.memberships.length;
  const hasMemberships = membershipCount > 0;
  const primaryMembership = access.memberships[0] ?? null;
  const primaryCompanyHref = primaryMembership?.company_slug
    ? `/company/${primaryMembership.company_slug}/home`
    : "/companies";
  const workEntranceTitle = access.is_platform_owner
    ? "TeamOptix"
    : primaryMembership?.company_name ?? "Company workspace";
  const workEntranceBody = access.is_platform_owner
    ? "Enter the gated TeamOptix workspace to govern products, customers, engineering, and company operations."
    : hasMemberships
      ? "Enter your company workspace to continue your assigned work."
      : "When a company invites you, your workspace entrance will appear here.";
  const workEntranceHref = access.is_platform_owner ? "/teamoptix/command-center" : primaryCompanyHref;

  return (
    <main className="workspace-shell">
      <header className="teamoptix-header">
        <Link className="brand-mark" href="/profile">
          <span className="brand-mark__kicker">Insight</span>
          <span className="brand-mark__name">My Workspace</span>
        </Link>

        <div className="teamoptix-header__right">
          <IdentityPill />
        </div>
      </header>

      <section className="workspace-main">
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
            <p className="eyebrow">My Workspace</p>
            <h1 className="workspace-title">
              {access.loading ? "Loading your workspace" : `Good to see you, ${name}.`}
            </h1>
            <p className="workspace-subtitle">
              Manage your identity, pending actions, and personal services across Insight.
            </p>
          </div>
        </header>

        <section className="summary-grid">
          <WorkspaceCard
            eyebrow="Identity"
            title="Personal information"
            body="Review the identity details and employment documents that belong to you and can be shared with company workspaces when needed."
            action={
              <>
                <button className="button" type="button" disabled>
                  Personal details
                </button>
                <button className="button" type="button" disabled>
                  Documents
                </button>
              </>
            }
          />

          <WorkspaceCard
            eyebrow="Work"
            title={workEntranceTitle}
            body={workEntranceBody}
            action={
              access.is_platform_owner || hasMemberships ? (
                <>
                  <Link className="button button-primary" href={workEntranceHref}>
                    Enter workspace
                  </Link>
                  {hasMemberships && !access.is_platform_owner ? (
                    <Link className="button" href="/companies">
                      Switch company
                    </Link>
                  ) : null}
                </>
              ) : null
            }
          />

          <WorkspaceCard
            eyebrow="Action Center"
            title="Pending actions"
            body="Onboarding tasks, company requests, document renewals, and required acknowledgements will appear here when they need your attention."
          />

          <WorkspaceCard
            eyebrow="Services"
            title="Account services"
            body="Manage platform services that belong to you, including security, passkeys, notifications, appearance, and future personal preferences."
            action={
              <>
                <button className="button" type="button" disabled>
                  Set up passkey
                </button>
                <button className="button" type="button" disabled>
                  Appearance
                </button>
              </>
            }
          />
        </section>
      </section>
    </main>
  );
}
