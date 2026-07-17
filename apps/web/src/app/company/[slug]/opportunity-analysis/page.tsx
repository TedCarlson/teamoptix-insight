import Link from "next/link";
import {
  OpportunityWorkspaceGrid,
  OpportunityWorkspaceHeader,
} from "@/features/opportunity-analysis/OpportunityWorkspace";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = `/company/${slug}/opportunity-analysis`;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("list_opportunity_analyses", { p_company_slug: slug });
  const opportunities = (data ?? []) as Array<{
    id: string; opportunity_number: string | null; station_name: string | null;
    opportunity_type: string; listing_location: string | null; status: string;
    zip_count: number; weekly_mileage: number | null; weekly_dispatch_min: number | null;
    weekly_dispatch_max: number | null; contract_start_date: string | null;
  }>;
  const count = (status: string) => opportunities.filter((item) => item.status === status).length;

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
          <div className="context-stat"><span className="context-stat__label">Draft opportunities</span><strong>{count("DRAFT")}</strong></div>
          <div className="context-stat"><span className="context-stat__label">Under review</span><strong>{count("UNDER_REVIEW")}</strong></div>
          <div className="context-stat"><span className="context-stat__label">Ready to compare</span><strong>{count("READY_TO_COMPARE")}</strong></div>
          <div className="context-stat"><span className="context-stat__label">Decisions recorded</span><strong>{opportunities.filter((item) => ["PURSUED", "AWARDED", "DECLINED"].includes(item.status)).length}</strong></div>
        </section>

        <section className="app-card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <div><h2 className="app-card__title">Saved opportunities</h2><p className="app-card__body" style={{ margin: "4px 0 0" }}>Durable analyses available for review and future comparison.</p></div>
          {opportunities.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead><tr>{["Opportunity", "Station", "Location", "Status", "ZIPs", "Weekly miles", "Dispatches", "Contract start"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #cbd5e1" }}>{label}</th>)}</tr></thead>
            <tbody>{opportunities.map((item) => <tr key={item.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}><Link href={`${base}/${item.id}`} style={{ fontWeight: 800 }}>{item.opportunity_number ?? "Unnumbered"}</Link></td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.station_name ?? "—"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.listing_location ?? "—"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.status.replaceAll("_", " ")}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.zip_count}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.weekly_mileage?.toLocaleString() ?? "—"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.weekly_dispatch_min === null ? "—" : `${item.weekly_dispatch_min}–${item.weekly_dispatch_max}`}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{item.contract_start_date ?? "—"}</td>
            </tr>)}</tbody>
          </table></div> : <p className="app-card__body" style={{ margin: 0 }}>No opportunities saved yet. Analyze a listing and save its report to begin the portfolio.</p>}
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
