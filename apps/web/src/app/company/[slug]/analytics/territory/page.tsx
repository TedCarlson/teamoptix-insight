import TerritoryIntelligenceSurface from "@/features/company/analytics/territory/TerritoryIntelligenceSurface";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TerritoryIntelligenceSurface slug={slug} />;
}
