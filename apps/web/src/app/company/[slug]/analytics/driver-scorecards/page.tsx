import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Performance"
          title="Driver Scorecards"
          purpose="Measure driver performance consistently among peers using versioned, explainable, and evidence-based criteria."
          expected={[
            "Company and individual scorecards",
    "Peer ranking and movement",
    "Top-three podium recognition",
    "Top-five recognition",
    "Private self-ranking for drivers",
    "Coaching opportunities and goals"
          ]}
      foundation="Public surfaces will celebrate positive results only. Drivers will retain private visibility into their own rank and evidence."
        />
      </section>
    </main>
  );
}
