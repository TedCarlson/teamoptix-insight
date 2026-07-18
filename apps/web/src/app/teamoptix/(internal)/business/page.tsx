import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getBusinessOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getBusinessOverview();
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Business" title="Business operations" description="Commercial obligations, customer agreements, payments, and the work required to move business forward."
    metrics={[
      { label: "Open legal tasks", value: data.openTasks.length, detail: "Customer agreement workflow" },
      { label: "Team Optix action", value: data.teamAction, detail: "Accepted and awaiting execution" },
      { label: "Locked versions", value: data.lockedVersions.length, detail: "Versioned legal evidence" },
      { label: "Recorded payments", value: data.paid.length, detail: "Paid implementation or subscription" },
    ]}
    panels={[
      { eyebrow: "Execution queue", title: "Contract and legal work", actionLabel: "All tasks", actionHref: "/teamoptix/business/contracts/tasks", rows: data.openTasks.slice(0, 5).map((row) => ({ title: String(row.document_title ?? "Customer agreement"), detail: `${String(row.company_name ?? "Customer")} · ${String(row.blocking_reason ?? "Legal workflow active")}`, status: row.status === "CUSTOMER_ACCEPTED" ? "Team Optix" : "Customer", href: "/teamoptix/business/contracts/tasks" })) },
      { eyebrow: "Business controls", title: "Operating lanes", rows: [
        { title: "Contract authoring", detail: `${data.documents.length} governed documents in the legal workspace`, status: "Open", href: "/teamoptix/business/contracts" },
        { title: "Finance", detail: "Billing, revenue, expenses, banking, and reporting controls", status: data.paid.length ? "Activity" : "Ready", href: "/teamoptix/business/finance" },
        { title: "Sales", detail: "Establish the authoritative opportunity and proposal pipeline", status: "Needs model", href: "/teamoptix/business/sales" },
        { title: "Marketing", detail: "Positioning, market evidence, and publishing governance", status: "Needs model", href: "/teamoptix/business/marketing" },
      ]},
    ]}
  />;
}
