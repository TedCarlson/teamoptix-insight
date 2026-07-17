import OpportunityScenarioModel, { type ScenarioOpportunity } from "@/features/opportunity-analysis/OpportunityScenarioModel";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ opportunity?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("list_opportunity_analyses", { p_company_slug: slug });
  return <main className="workspace-shell"><section className="workspace-main" style={{ display: "grid", gap: 14 }}>
    <header className="evidence-print-hide"><p className="value-card__eyebrow">Opportunity Analysis · Scenario modeling</p><h1 style={{ margin: 0 }}>Planning Assumptions</h1><p className="app-card__body">Select a saved opportunity and adjust operating variables without changing its source evidence.</p></header>
    <OpportunityScenarioModel companySlug={slug} opportunities={(data ?? []) as ScenarioOpportunity[]} initialId={query.opportunity} />
  </section></main>;
}
