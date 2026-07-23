import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";
import { isActiveCollectionRequest, isCleanCompleteCollectionRequest, isCollectionRequestException } from "@/features/automation/lib/collectionRequestOutcome";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAutomationOverview();
  const failed = data.requests.filter(isCollectionRequestException);
  const active = data.requests.filter(isActiveCollectionRequest);
  const complete = data.requests.filter(isCleanCompleteCollectionRequest);
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Collections" description="Follow every generated request from demand through ingestion evidence."
    metrics={[{ label: "7-day requests", value: data.requests.length, detail: "Governed customer scope" }, { label: "Active", value: active.length, detail: "Queued through ingestion" }, { label: "Complete", value: complete.length, detail: "Terminal success" }, { label: "Failed", value: failed.length, detail: "Requires review" }]}
    panels={[{ eyebrow: "Collection trail", title: "Recent requests", rows: data.requests.slice(0, 12).map((row: any) => ({ title: `${String(row.request_type).replaceAll("_", " ")} · ${row.request_status}`, detail: `${row.company_slug} · ${new Date(row.created_at).toLocaleString()}${row.error_message ? ` · ${row.error_message}` : ""}`, status: row.request_status === "COMPLETE" && row.error_message ? "Review" : row.request_status, href: `/teamoptix/automation/collections/${row.id}` })) }, { eyebrow: "Exceptions", title: "Requests needing attention", rows: failed.length ? failed.slice(0, 8).map((row: any) => ({ title: String(row.request_type).replaceAll("_", " "), detail: `${row.company_slug} · ${row.error_message || "Open the artifact outcomes to identify the failed file"}`, status: row.request_status === "FAILED" ? "Failed" : "Review", href: `/teamoptix/automation/collections/${row.id}` })) : [{ title: "No collection exceptions", detail: "The trailing seven-day collection queue is clear", status: "Clear", href: "/teamoptix/automation/collections" }] }]}
  />;
}
