import RoutePortfolioSurface from "@/features/company/analytics/RoutePortfolioSurface";

export default async function Page(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  return <RoutePortfolioSurface slug={slug} />;
}
