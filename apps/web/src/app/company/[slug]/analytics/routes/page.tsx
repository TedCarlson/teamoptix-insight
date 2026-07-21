import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Routes"
          title="Route Intelligence"
          purpose="Compare route behavior, volume, volatility, density, and performance across time and comparable operating conditions."
          expected={[
            "Route history and baselines",
    "Heavy, light, and shifted route signals",
    "Stop and package density",
    "Route volatility",
    "Comparable weekday analysis",
    "Persistent route opportunities"
          ]}
        />
      </section>
    </main>
  );
}
