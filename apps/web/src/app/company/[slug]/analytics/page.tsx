import AnalyticsDashboardSurface from "@/features/company/analytics/AnalyticsDashboardSurface";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AnalyticsDashboardSurface slug={slug} />;
}
