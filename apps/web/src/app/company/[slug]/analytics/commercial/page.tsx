import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Commercial"
          title="Commercial Intelligence"
          purpose="Connect governed operational evidence to subscription, contract, growth, and negotiation decisions."
          expected={[
            "Observed route-tier validation",
    "Weekday and weekend operating averages",
    "Subscription alignment signals",
    "Contract growth evidence",
    "Negotiation-period reporting",
    "Expansion and tier-review indicators"
          ]}
      foundation="Commercial signals will inform review and governance. They will not silently modify subscription or Stripe state."
        />
      </section>
    </main>
  );
}
