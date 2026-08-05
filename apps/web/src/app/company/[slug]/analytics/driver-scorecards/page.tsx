import DriverScorecardSurface from "@/features/company/analytics/driver-scorecards/DriverScorecardSurface";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DriverScorecardSurface slug={slug} />;
}
