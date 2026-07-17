import Link from "next/link";
import {
  OpportunityWorkspaceGrid,
  OpportunityWorkspaceHeader,
} from "@/features/opportunity-analysis/OpportunityWorkspace";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = `/company/${slug}/opportunity-analysis`;

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ display: "grid", gap: 14 }}>
        <OpportunityWorkspaceHeader
          eyebrow="Prospective intelligence"
          title="Opportunity Analysis"
          description="Evaluate prospective contracted service areas using listing facts, governed assumptions, and geographic reference data."
          action={<Link className="button button-primary" href={`${base}/new`}>New analysis</Link>}
        />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div className="context-stat"><span className="context-stat__label">Draft opportunities</span><strong>0</strong></div>
          <div className="context-stat"><span className="context-stat__label">Under review</span><strong>0</strong></div>
          <div className="context-stat"><span className="context-stat__label">Ready to compare</span><strong>0</strong></div>
          <div className="context-stat"><span className="context-stat__label">Decisions recorded</span><strong>0</strong></div>
        </section>

        <OpportunityWorkspaceGrid links={[
          { eyebrow: "Pipeline", title: "Opportunities", body: "Manage draft, reviewed, pursued, awarded, and declined opportunities.", href: base },
          { eyebrow: "Intake", title: "New Analysis", body: "Capture opportunity identity, ship center, and the Additional Information listing block.", href: `${base}/new` },
          { eyebrow: "Decision support", title: "Comparisons", body: "Compare territory burden and operating assumptions across opportunities.", href: `${base}/comparisons` },
          { eyebrow: "Governance", title: "Assumptions", body: "Control six- and seven-day scenarios, distance factors, Peak factors, and future vehicle norms.", href: `${base}/assumptions` },
          { eyebrow: "Evidence", title: "Reference Data", body: "Inspect ZIP, centroid, population, density, and source-recency coverage.", href: `${base}/reference-data` },
        ]} />
      </section>
    </main>
  );
}
