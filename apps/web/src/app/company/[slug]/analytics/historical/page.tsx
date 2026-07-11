import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Historical"
          title="Historical Analytics"
          purpose="Compare operating years, seasons, Peak periods, and contract evolution as the available evidence becomes richer."
          expected={[
            "Year-over-year comparisons",
    "Seasonal and Peak modeling",
    "Weekday and weekend evolution",
    "Long-term route growth",
    "Stop and package growth",
    "Contract-start and negotiation context"
          ]}
      foundation="Historical reports will load deliberately by selected year so traffic and computation remain intentional."
        />
      </section>
    </main>
  );
}
