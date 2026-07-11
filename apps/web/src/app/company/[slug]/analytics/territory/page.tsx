import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Territory"
          title="Territory Intelligence"
          purpose="Model the operating characteristics of the service territory and explain how geography influences contract performance."
          expected={[
            "ZIP-code coverage",
    "Population and household density",
    "Miles and travel time from terminal",
    "Territory expansion history",
    "Urban, suburban, and rural mix",
    "Stops and packages by geographic density"
          ]}
        />
      </section>
    </main>
  );
}
