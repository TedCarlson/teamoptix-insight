import RouteIntelligenceSurface from "@/features/company/analytics/routes/RouteIntelligenceSurface";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RouteIntelligenceSurface slug={slug} />;
}
