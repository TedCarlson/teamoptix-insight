import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAutomationOverview();
  const active = data.requests.filter((row: any) => ["CLAIMED", "RUNNING", "ARTIFACTS_READY", "INGESTING"].includes(row.request_status));
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Runner fleet" description="Observe runner demand and execution evidence without granting runners authority over ingestion decisions."
    metrics={[{ label: "Enabled assignments", value: data.assignments, detail: "Standing demand sources" }, { label: "Active claims", value: active.length, detail: "Work in motion" }, { label: "7-day runs", value: data.runs.length, detail: "Recorded executions" }, { label: "Heartbeat coverage", value: "—", detail: "Durable runner heartbeat pending" }]}
    panels={[{ eyebrow: "Execution boundary", title: "Runner responsibility", rows: [{ title: "Claim governed tickets", detail: "The runner receives the compiled instruction and collection targets", status: "Defined", href: "/teamoptix/automation/ticket-library" }, { title: "Ship artifacts", detail: "Files and transport evidence move to storage without business-date adjudication", status: "Defined", href: "/teamoptix/automation/collections" }, { title: "Ingestion remains downstream", detail: "The ingestion engine reads file contents and determines record dates", status: "Protected", href: "/teamoptix/automation/telemetry" }] }, { eyebrow: "Current demand", title: "Requests in motion", rows: active.length ? active.slice(0, 8).map((row: any) => ({ title: `${String(row.request_type).replaceAll("_", " ")} · ${row.request_status}`, detail: `${row.company_slug} · created ${new Date(row.created_at).toLocaleString()}`, status: row.request_status, href: "/teamoptix/automation/collections" })) : [{ title: "No active runner claims", detail: "No governed collection work is currently in motion", status: "Idle", href: "/teamoptix/automation/collections" }] }]}
  />;
}
