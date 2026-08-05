import WorkforceAnalyticsSurface from "@/features/company/analytics/workforce/WorkforceAnalyticsSurface";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <WorkforceAnalyticsSurface slug={slug} />;
}
