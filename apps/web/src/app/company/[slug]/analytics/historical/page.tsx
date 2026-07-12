import HistoricalAnalyticsSurface from "@/features/company/analytics/HistoricalAnalyticsSurface";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: Props) {
  const { slug } = await params;

  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <HistoricalAnalyticsSurface slug={slug} />
      </section>
    </main>
  );
}
