import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAutomationOverview();
  const totalRuns = data.successfulRuns.length + data.failedRuns.length;
  const reliability = totalRuns ? `${Math.round(data.successfulRuns.length / totalRuns * 1000) / 10}%` : "—";
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Automation control" description="Collection demand, runner execution, artifact movement, and ingestion outcomes across governed Insight customers."
    metrics={[
      { label: "Active templates", value: data.templates, detail: "Reusable collection contracts" },
      { label: "Enabled assignments", value: data.assignments, detail: "Company automation bindings" },
      { label: "7-day reliability", value: reliability, detail: `${totalRuns} recorded runs` },
      { label: "Awaiting ingestion", value: data.awaitingArtifacts, detail: "Artifacts not yet complete" },
    ]}
    panels={[
      { eyebrow: "Exceptions", title: "Automation attention", actionLabel: "Telemetry", actionHref: "/teamoptix/automation/telemetry", rows: data.failedRuns.length ? data.failedRuns.slice(0, 6).map((row) => ({ title: `${String(row.automation_type).replaceAll("_", " ")} failed`, detail: `${String(row.company_slug)} · ${String(row.error_message ?? "Inspect recorded run")}`, status: "Failed", href: "/teamoptix/automation/telemetry" })) : [{ title: "No recorded run failures", detail: "The trailing seven-day automation exception queue is clear", status: "Clear", href: "/teamoptix/automation/telemetry" }] },
      { eyebrow: "Control plane", title: "Automation workflow", rows: [
        { title: "Ticket library", detail: `${data.templates} active machine-readable collection contracts`, status: "Live", href: "/teamoptix/automation/ticket-library" },
        { title: "Company assignments", detail: `${data.assignments} enabled bindings define customer-specific execution`, status: "Live", href: "/teamoptix/automation/assignments" },
        { title: "Collections", detail: `${data.requests.length} collection requests recorded in the trailing seven days`, status: "Live", href: "/teamoptix/automation/collections" },
        { title: "Runner fleet", detail: "Runner identity and heartbeat still require a durable telemetry model", status: "Needs heartbeat", href: "/teamoptix/automation/runners" },
      ]},
    ]}
  />;
}
