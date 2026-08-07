import PeakPlanningSurface from "@/features/company/analytics/peak-planning/PeakPlanningSurface";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PeakPlanningSurface slug={slug} />;
}
