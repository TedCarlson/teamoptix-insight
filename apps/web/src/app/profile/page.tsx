"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import IdentityPill from "@/features/access/components/IdentityPill";
import { useAccess } from "@/features/access/AccessProvider";

type CandidateApplication = { id: string; company_name?: string | null; company_slug?: string | null; role_interest?: string | null; location_interest?: string | null; application_status: string; association_status: string; scheduling_policy: string; submitted_at: string };

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
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [candidateMessage, setCandidateMessage] = useState("");
  const [candidateError, setCandidateError] = useState("");

  const loadApplications = useCallback(async () => {
    const response = await fetch("/api/profile/candidate-applications", { cache: "no-store", credentials: "include" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load candidate paths.");
    setApplications(body.applications || []);
  }, []);

  useEffect(() => {
    if (access.loading || !access.email) return;
    const params = new URLSearchParams(window.location.search);
    const applicationId = params.get("application");
    const claimToken = params.get("claim");
    async function start() {
      if (applicationId && claimToken) {
        const response = await fetch(`/api/profile/candidate-applications/${applicationId}/claim`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimToken }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to connect this candidate submission.");
        setCandidateMessage("Candidate submission connected to your profile.");
        window.history.replaceState({}, "", "/profile");
      }
      await loadApplications();
    }
    void start().catch((reason) => setCandidateError(reason instanceof Error ? reason.message : "Unable to load candidate paths."));
  }, [access.email, access.loading, loadApplications]);

  const name =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "there";

  const activeMemberships = access.memberships.filter((membership) => membership.membership_status === "active");
  const membershipCount = activeMemberships.length;
  const hasMemberships = membershipCount > 0;
  const primaryMembership = activeMemberships[0] ?? null;
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
            body={applications.length ? `${applications.length} candidate path${applications.length === 1 ? " is" : "s are"} connected to your profile. Hiring requirements and interview next steps can continue here before company membership is active.` : "Onboarding tasks, company requests, document renewals, and required acknowledgements will appear here when they need your attention."}
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

        {candidateError ? <p style={{ color: "#b91c1c", fontWeight: 700 }}>{candidateError}</p> : null}
        {candidateMessage ? <p style={{ color: "#166534", fontWeight: 700 }}>{candidateMessage}</p> : null}
        {applications.length ? <section className="app-card workspace-section" style={{ marginTop: 18 }}><p className="eyebrow">Candidate paths</p><h2>Hiring progress connected to you</h2><div style={{ display: "grid", gap: 10, marginTop: 14 }}>{applications.map((application) => <article key={application.id} style={{ border: "1px solid #dbe4ef", borderRadius: 14, padding: 14 }}><strong>{application.company_name || "Insight opportunity"}</strong><p style={{ margin: "5px 0" }}>{application.role_interest || "Role to be discussed"}{application.location_interest ? ` · ${application.location_interest}` : ""}</p><small>{application.application_status.replaceAll("_", " ")} · interview {application.scheduling_policy} · profile {application.association_status}</small></article>)}</div></section> : null}
      </section>
    </main>
  );
}
