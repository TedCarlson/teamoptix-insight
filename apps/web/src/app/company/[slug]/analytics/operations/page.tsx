import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Operations"
          title="Operations Analytics"
          purpose="Explore contract volume, operating patterns, weekday and weekend behavior, and daily or weekly demand trends."
          expected={[
            "Year selection and deliberate report loading",
    "Weekday versus weekend averages",
    "Day-of-week volume slices",
    "Weekly stops and package trends",
    "Route-volume and demand comparisons",
    "Presentation-ready exports"
          ]}
      foundation="The first implementation will begin with the selected-year operations payload that powers every chart, slice, and export."
        />
      </section>
    </main>
  );
}
