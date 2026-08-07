import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAutomationOverview();
  const terminalRequests = data.successfulRequests.length + data.failedRequests.length;
  const reliability = terminalRequests ? `${Math.round(data.successfulRequests.length / terminalRequests * 1000) / 10}%` : "—";
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Automation control" description="Collection demand, runner execution, artifact movement, and ingestion outcomes across governed Insight customers."
    metrics={[
      { label: "Active templates", value: data.templates, detail: "Reusable collection contracts" },
      { label: "Enabled assignments", value: data.assignments, detail: "Company automation bindings" },
      { label: "7-day reliability", value: reliability, detail: `${terminalRequests} terminal collection requests` },
      { label: "Awaiting ingestion", value: data.awaitingArtifacts, detail: "Artifacts not yet complete" },
    ]}
    panels={[
      { eyebrow: "Current exceptions", title: "Needs attention now", actionLabel: "History", actionHref: "/teamoptix/automation/telemetry", rows: data.attentionRequests.length ? data.attentionRequests.slice(0, 6).map((row) => ({ id: row.id, title: `${String(row.request_type).replaceAll("_", " ")} failed`, detail: `${String(row.company_slug)} · ${String(row.error_message ?? "Inspect collection evidence")}`, status: "Failed", href: `/teamoptix/automation/collections/${row.id}` })) : data.attentionRuns.length ? data.attentionRuns.slice(0, 6).map((row) => ({ id: row.id, title: `${String(row.automation_type).replaceAll("_", " ")} failed`, detail: `${String(row.company_slug)} · ${String(row.error_message ?? "Inspect recorded run")}`, status: "Failed", href: "/teamoptix/automation/telemetry" })) : [{ title: "No current automation exceptions", detail: "A later clean completion has closed any earlier failures; history remains available in Telemetry", status: "Healthy", href: "/teamoptix/automation/telemetry" }] },
      { eyebrow: "Control plane", title: "Automation workflow", rows: [
        { title: "Ticket library", detail: `${data.templates} active machine-readable collection contracts`, status: "Live", href: "/teamoptix/automation/ticket-library" },
        { title: "Company assignments", detail: `${data.assignments} enabled bindings define customer-specific execution`, status: "Live", href: "/teamoptix/automation/assignments" },
        { title: "Collections", detail: `${data.requests.length} collection requests recorded in the trailing seven days`, status: "Live", href: "/teamoptix/automation/collections" },
        { title: "Runner fleet", detail: "Terminal receipts show health; bounded audit evidence appears only on failure", status: "Live", href: "/teamoptix/automation/runners" },
      ]},
    ]}
  />;
}
