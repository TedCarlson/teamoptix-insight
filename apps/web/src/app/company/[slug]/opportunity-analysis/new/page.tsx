import NewOpportunityAnalyzer from "@/features/opportunity-analysis/NewOpportunityAnalyzer";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main className="workspace-shell"><section className="workspace-main"><NewOpportunityAnalyzer companySlug={slug} /></section></main>;
}
