"use client";

import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

const workspaceDomains = [
  {
    eyebrow: "Business",
    title: "Company operations",
    body: "Sales, marketing, contracts, legal, finance, and internal operating work.",
    href: "/teamoptix/business",
  },
  {
    eyebrow: "Products",
    title: "Product portfolio",
    body: "Govern Insight, ITG, and future products as TeamOptix-owned assets.",
    href: "/teamoptix/products",
  },
  {
    eyebrow: "Customers",
    title: "Customer oversight",
    body: "Review customer accounts, priorities, implementation posture, and support needs.",
    href: "/teamoptix/customers",
  },
  {
    eyebrow: "Engineering",
    title: "Software delivery",
    body: "Track repositories, releases, platform health, and engineering decisions.",
    href: "/teamoptix/engineering",
  },
  {
    eyebrow: "Automation",
    title: "Platform automation",
    body: "Monitor runners, collections, telemetry, and automated operating workflows.",
    href: "/teamoptix/automation",
  },
  {
    eyebrow: "AI",
    title: "Operating intelligence",
    body: "Manage prompts, assistants, evaluations, and AI-enabled workflows.",
    href: "/teamoptix/ai",
  },
];

export default function TeamOptixCommandCenterPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix"
            title="Workspace"
            description="Operate TeamOptix as the company that governs products, customers, engineering, and business operations."
          />

          <section className="summary-grid">
            {workspaceDomains.map((domain) => (
              <article className="app-card" key={domain.href}>
                <p className="value-card__eyebrow">{domain.eyebrow}</p>
                <h3 className="app-card__title">{domain.title}</h3>
                <p className="app-card__body">{domain.body}</p>
                <div className="cta-row" style={{ marginTop: 14 }}>
                  <Link className="button" href={domain.href}>
                    Open
                  </Link>
                </div>
              </article>
            ))}
          </section>

          <WorkspaceSection
            eyebrow="Directory"
            title="Company Directory"
            description="Enter customer company workspaces from inside the authenticated TeamOptix environment."
            action={
              <Link className="button button-primary" href="/companies">
                Open Company Directory
              </Link>
            }
          >
            <div />
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
