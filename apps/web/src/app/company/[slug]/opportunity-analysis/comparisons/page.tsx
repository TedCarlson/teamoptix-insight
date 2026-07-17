import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const [{ data }, { data: versionData }] = await Promise.all([
    supabase.rpc("list_opportunity_analyses", { p_company_slug: slug }),
    supabase.rpc("list_opportunity_model_versions", { p_company_slug: slug, p_analysis_id: null }),
  ]);
  const rows = (data ?? []) as Array<Record<string, string | number | null>>;
  const versions = (versionData ?? []) as Array<Record<string, unknown>>;
  return <main className="workspace-shell"><section className="workspace-main" style={{ display: "grid", gap: 14 }}>
    <header><p className="value-card__eyebrow">Opportunity Analysis · Saved portfolio</p><h1 style={{ margin: 0 }}>Opportunity Warehouse</h1><p className="app-card__body">Source opportunities and immutable model versions form the durable comparison record.</p></header>
    <article className="app-card" style={{ padding: 16, overflowX: "auto" }}>
      <h2 style={{margin:"0 0 4px"}}>Saved model versions</h2><p className="app-card__body" style={{margin:"0 0 12px"}}>Each row preserves the evidence baseline, authored assumptions, fleet and labor mix, and calculated result at the moment it was saved.</p>
      {versions.length ? <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}><thead><tr>{["Opportunity","Station","Version","Saved","Gross revenue","Operating cost","Contribution","Margin"].map((label)=><th key={label} style={{textAlign:"left",padding:8,borderBottom:"1px solid #cbd5e1"}}>{label}</th>)}</tr></thead><tbody>{versions.map((version)=>{ const result=(version.result_snapshot??{}) as Record<string,number>; return <tr key={String(version.id)}><Cell><strong>{String(version.opportunity_number??"Unnumbered")}</strong></Cell><Cell>{String(version.station_name??"—")}</Cell><Cell>Version {String(version.version_number)}</Cell><Cell>{new Date(String(version.created_at)).toLocaleString()}</Cell><Cell>{range(result.revenueLow,result.revenueHigh)}</Cell><Cell>{money(result.totalOperatingCost)}</Cell><Cell>{range(result.contributionLow,result.contributionHigh)}</Cell><Cell>{percentRange(result.marginLow,result.marginHigh)}</Cell></tr>;})}</tbody></table> : <p className="app-card__body" style={{margin:0}}>No model versions saved yet.</p>}
    </article>
    <article className="app-card" style={{ padding: 16, overflowX: "auto" }}>
      <h2 style={{margin:"0 0 12px"}}>Source opportunities</h2>
      {rows.length ? <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead><tr>{["Opportunity", "Station", "Location", "Status", "ZIPs", "Weekly miles", "Weekly stops", "Weekly packages", "Dispatches", "Actions"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #cbd5e1" }}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const stops = Number(row.weekly_delivery_stops ?? 0) + Number(row.weekly_pickup_stops ?? 0);
          const packages = Number(row.weekly_delivery_packages ?? 0) + Number(row.weekly_pickup_packages ?? 0);
          return <tr key={String(row.id)}>
            <Cell><strong>{String(row.opportunity_number ?? "Unnumbered")}</strong></Cell><Cell>{row.station_name}</Cell><Cell>{row.listing_location}</Cell><Cell>{String(row.status).replaceAll("_", " ")}</Cell><Cell>{row.zip_count}</Cell><Cell>{Number(row.weekly_mileage ?? 0).toLocaleString()}</Cell><Cell>{stops.toLocaleString()}</Cell><Cell>{packages.toLocaleString()}</Cell><Cell>{row.weekly_dispatch_min}–{row.weekly_dispatch_max}</Cell>
            <Cell><span style={{ display: "flex", gap: 8 }}><Link href={`/company/${slug}/opportunity-analysis/${row.id}`}>Report</Link><Link href={`/company/${slug}/opportunity-analysis/assumptions?opportunity=${row.id}`}>Model</Link></span></Cell>
          </tr>;
        })}</tbody>
      </table> : <p className="app-card__body" style={{ margin: 0 }}>No saved opportunities yet.</p>}
    </article>
  </section></main>;
}

function Cell({ children }: { children: React.ReactNode }) { return <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{children ?? "—"}</td>; }
function money(value:unknown) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(value??0)); }
function range(low:unknown,high:unknown) { return `${money(low)}–${money(high)}`; }
function percentRange(low:unknown,high:unknown) { const format=(value:unknown)=>new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:1}).format(Number(value??0)); return `${format(low)}–${format(high)}`; }
