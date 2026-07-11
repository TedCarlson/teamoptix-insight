import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Reporting"
          title="Analytics Exports"
          purpose="Package governed analytical evidence for presentations, deeper review, negotiations, and external reporting."
          expected={[
            "Excel workbooks",
    "CSV evidence extracts",
    "Executive PDF snapshots",
    "Presentation-ready charts",
    "Operations review packages",
    "Commercial and negotiation reports"
          ]}
        />
      </section>
    </main>
  );
}
