import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PrintAnalysisButton from "@/features/opportunity-analysis/PrintAnalysisButton";

function value(input: unknown) {
  return input === null || input === undefined || input === "" ? "—" : typeof input === "number" ? input.toLocaleString() : String(input);
}

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("get_opportunity_analysis", { p_company_slug: slug, p_opportunity_id: id });
  if (!data) notFound();
  const item = data as Record<string, unknown>;
  const parsed = (item.parsed_listing ?? {}) as Record<string, unknown>;
  const zipAnalysis = (item.zip_analysis ?? {}) as { terminal?: Record<string, unknown>; rows?: Array<Record<string, unknown>>; unresolved_zip_codes?: string[] };
  const rows = zipAnalysis.rows ?? [];
  const standard = rows.filter((row) => row.classification === "STANDARD" && row.population !== null);
  const population = standard.reduce((sum, row) => sum + Number(row.population ?? 0), 0);
  const establishments = rows.reduce((sum, row) => sum + Number(row.business_establishments ?? 0), 0);
  const employment = rows.reduce((sum, row) => sum + Number(row.business_employment ?? 0), 0);

  return <main className="workspace-shell"><section className="workspace-main" style={{ display: "grid", gap: 14 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div><p className="value-card__eyebrow">{value(item.opportunity_number)}</p><h1 style={{ margin: 0 }}>{value(item.station_name)}</h1><p className="app-card__body">{value(item.listing_location)} · {value(item.opportunity_type)}</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="pill">{String(item.status).replaceAll("_", " ")}</span><PrintAnalysisButton /><Link className="button" href={`/company/${slug}/opportunity-analysis`}>Back to opportunities</Link></div>
    </header>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
      <Metric label="ZIPs" value={(item.zip_codes as string[] | undefined)?.length ?? 0} />
      <Metric label="Weekly miles" value={item.weekly_mileage} />
      <Metric label="Weekly stops" value={Number(item.weekly_delivery_stops ?? 0) + Number(item.weekly_pickup_stops ?? 0)} />
      <Metric label="Weekly packages" value={Number(item.weekly_delivery_packages ?? 0) + Number(item.weekly_pickup_packages ?? 0)} />
      <Metric label="Weekly dispatches" value={item.weekly_dispatch_min === null ? null : `${item.weekly_dispatch_min}–${item.weekly_dispatch_max}`} />
      <Metric label="Contract start" value={item.contract_start_date} />
    </section>
    <article className="app-card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div><strong>Terminal and territory evidence</strong><p className="app-card__body" style={{ margin: "4px 0 0" }}>{value(zipAnalysis.terminal?.matched_address ?? item.terminal_address)} · Presumed analytical origin</p></div>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        <Metric label="Residential population" value={population} /><Metric label="Business establishments" value={establishments} /><Metric label="Reported employment" value={employment} /><Metric label="Resolved ZIP rows" value={rows.length} />
      </section>
      <p className="app-card__body" style={{ margin: 0 }}>This saved evidence snapshot preserves the source and reference results used when the opportunity was analyzed. Future assumption scenarios will reference this record without changing its source facts.</p>
    </article>
    {Array.isArray(parsed.warnings) && parsed.warnings.length ? <article className="app-card" style={{ padding: 16 }}><strong>Review notes</strong><ul>{parsed.warnings.map((warning) => <li key={String(warning)}>{String(warning)}</li>)}</ul></article> : null}
  </section></main>;
}

function Metric({ label, value: input }: { label: string; value: unknown }) {
  return <div className="context-stat"><span className="context-stat__label">{label}</span><strong>{value(input)}</strong></div>;
}
