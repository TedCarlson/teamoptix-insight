import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAutomationOverview();
  const failed = data.requests.filter((row: any) => row.request_status === "FAILED");
  const active = data.requests.filter((row: any) => ["QUEUED", "CLAIMED", "RUNNING", "ARTIFACTS_READY", "INGESTING"].includes(row.request_status));
  const complete = data.requests.filter((row: any) => row.request_status === "COMPLETE");
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Collections" description="Follow every generated request from demand through ingestion evidence."
    metrics={[{ label: "7-day requests", value: data.requests.length, detail: "Governed customer scope" }, { label: "Active", value: active.length, detail: "Queued through ingestion" }, { label: "Complete", value: complete.length, detail: "Terminal success" }, { label: "Failed", value: failed.length, detail: "Requires review" }]}
    panels={[{ eyebrow: "Collection trail", title: "Recent requests", rows: data.requests.slice(0, 12).map((row: any) => ({ title: `${String(row.request_type).replaceAll("_", " ")} · ${row.request_status}`, detail: `${row.company_slug} · ${new Date(row.created_at).toLocaleString()}${row.error_message ? ` · ${row.error_message}` : ""}`, status: row.request_status, href: `/teamoptix/automation/collections/${row.id}` })) }, { eyebrow: "Exceptions", title: "Requests needing attention", rows: failed.length ? failed.slice(0, 8).map((row: any) => ({ title: String(row.request_type).replaceAll("_", " "), detail: `${row.company_slug} · ${row.error_message || "Open the artifact outcomes to identify the failed file"}`, status: "Failed", href: `/teamoptix/automation/collections/${row.id}` })) : [{ title: "No failed requests", detail: "The trailing seven-day collection queue is clear", status: "Clear", href: "/teamoptix/automation/collections" }] }]}
  />;
}
