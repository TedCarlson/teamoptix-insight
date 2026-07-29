import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";
import LocalDateTime from "@/features/automation/components/LocalDateTime";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAutomationOverview();
  const total = data.successfulRequests.length + data.failedRequests.length;
  const reliability = total ? `${Math.round(data.successfulRequests.length / total * 1000) / 10}%` : "—";
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Automation telemetry" description="Measure execution reliability, failure patterns, and artifact movement across governed customers."
    metrics={[{ label: "7-day reliability", value: reliability, detail: `${total} terminal collection requests` }, { label: "Successful", value: data.successfulRequests.length, detail: "Completed collections" }, { label: "Failed", value: data.failedRequests.length, detail: "Failed collections" }, { label: "Awaiting ingestion", value: data.awaitingArtifacts, detail: "Artifact movement queue" }]}
    panels={[{ eyebrow: "Collection trail", title: "Recent governed outcomes", rows: data.requests.slice(0, 12).map((row: any) => ({ title: `${String(row.request_type).replaceAll("_", " ")} · ${row.request_status}`, detail: <>{row.company_slug} · <LocalDateTime value={String(row.created_at)} />{row.error_message ? ` · ${row.error_message}` : ""}</>, status: row.request_status, href: "/teamoptix/automation/collections" })) }, { eyebrow: "Failure intelligence", title: "Exceptions", rows: data.failedRequests.length ? data.failedRequests.slice(0, 12).map((row: any) => ({ title: String(row.request_type).replaceAll("_", " "), detail: `${row.company_slug} · ${row.error_message || "Inspect collection evidence"}`, status: "Failed", href: "/teamoptix/automation/collections" })) : data.failedRuns.length ? data.failedRuns.slice(0, 8).map((row: any) => ({ title: String(row.automation_type).replaceAll("_", " "), detail: `${row.company_slug} · ${row.error_message || "Inspect runtime evidence"}`, status: "Failed", href: "/teamoptix/automation/collections" })) : [{ title: "No recorded failures", detail: "No failed collections or runner executions in the trailing seven days", status: "Clear", href: "/teamoptix/automation/collections" }] }]}
  />;
}
