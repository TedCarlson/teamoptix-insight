import AnalyticsStubSurface from "@/features/company/analytics/AnalyticsStubSurface";

export default function Page() {
  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <AnalyticsStubSurface
          eyebrow="Analytics · Workforce"
          title="Workforce Analytics"
          purpose="Understand staffing capacity, attendance, time off, hiring, retention, coverage, and workforce operating patterns."
          expected={[
            "Attendance and call-out ratios",
    "Five-day and six-day schedule factors",
    "Hiring and retention trends",
    "Time-off and coverage patterns",
    "Workforce capacity signals",
    "Payroll and schedule alignment"
          ]}
        />
      </section>
    </main>
  );
}
