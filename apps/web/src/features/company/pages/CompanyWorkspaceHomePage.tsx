"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { buildMobileWorkspaceGroups } from "@/features/mobile-workspace/mobileWorkspace";

export default function CompanyWorkspaceHomePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const access = useAccess();
  const membership = access.memberships.find((item) => item.company_slug === slug) ?? null;
  const groups = buildMobileWorkspaceGroups(access, slug);
  const destinationCount = groups.reduce((count, group) => count + group.destinations.length, 0);

  return (
    <main className="workspace-shell company-workspace-home">
      <section style={{ width: "var(--app-page)", margin: "0 auto", padding: "28px 0 36px", display: "grid", gap: 18 }}>
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">Company workspace</p>
            <h1 className="workspace-title">Your tools, matched to your access</h1>
            <p className="workspace-subtitle">{membership?.title || "Company member"} · {destinationCount} assigned workspace{destinationCount === 1 ? "" : "s"}</p>
          </div>
        </header>

        {groups.map((group) => (
          <section className="app-card" key={group.key} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2 className="app-card__title">{group.label}</h2><strong>{group.destinations.length}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {group.destinations.map((destination) => (
                <Link className="value-card" href={destination.href} key={destination.key} style={{ padding: 14, textDecoration: "none" }}>
                  <strong>{destination.label}</strong>
                  <p className="app-card__body" style={{ marginTop: 5 }}>{destination.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {!access.loading && groups.length === 0 ? (
          <section className="app-card"><h2 className="app-card__title">Basic company access</h2><p className="app-card__body">No management tools are assigned. Continue to your driver workspace.</p><Link className="button button-primary" href={`/company/${slug}/home`}>Open driver workspace</Link></section>
        ) : null}
      </section>
    </main>
  );
}
