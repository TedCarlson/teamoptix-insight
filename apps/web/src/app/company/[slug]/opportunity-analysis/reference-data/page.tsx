import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return <main className="workspace-shell"><section className="workspace-main"><AnalyticsStubSurface eyebrow="Opportunity Analysis · Evidence" title="Reference Data" purpose="Make the geographic and operating evidence behind every opportunity calculation inspectable and current." expected={["ZIP classification", "Population-weighted centroids", "Population and land area", "Ship-center geocoding", "Source coverage dates", "Vehicle norms"]} foundation="The ZIP reference foundation is prepared. Census population and ZCTA land-area enrichment will complete the defensible density layer." /></section></main>;
}
