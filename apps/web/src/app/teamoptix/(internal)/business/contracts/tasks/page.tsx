import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getCustomerLegalTasks } from "@/features/legal/server/legal.repository";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export const dynamic = "force-dynamic";

function value(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : null;
}

function statusTone(status: string) {
  if (status === "READY_FOR_CUSTOMER_REVIEW") return "Customer Action";
  if (status === "CUSTOMER_ACCEPTED") return "Team Optix";
  if (status === "TEAMOPTIX_EXECUTED") return "Vault";
  if (status === "EXECUTED_AND_VAULTED") return "Complete";
  return status.replaceAll("_", " ");
}

function documentHref(row: Record<string, unknown>) {
  const key = value(row, "document_key");
  if (!key) return "/teamoptix/business/contracts";
  return `/teamoptix/business/contracts/client-documents/${encodeURIComponent(key)}`;
}

export default async function TeamOptixCustomerLegalTasksPage() {
  const tasks = (await getCustomerLegalTasks()) as Record<string, unknown>[];
  const openTasks = tasks.filter((task) => {
    const status = value(task, "status");
    return status !== "EXECUTED_AND_VAULTED" && status !== "CANCELLED";
  });
  const customerActionCount = tasks.filter((task) => value(task, "status") === "READY_FOR_CUSTOMER_REVIEW").length;
  const teamOptixActionCount = tasks.filter((task) => value(task, "status") === "CUSTOMER_ACCEPTED").length;

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business · Legal"
            title="Customer Legal Tasks"
            description="Customer-facing legal obligations created from locked client document versions. These tasks will become the customer signature and Go Live readiness gate."
            action={
              <Link className="secondary-action" href="/teamoptix/business/contracts">
                Back to Contracts
              </Link>
            }
          />

          <section className="summary-grid">
            <WorkspaceSection eyebrow="Legal Tasks" title={String(openTasks.length)} description="Open customer legal tasks.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Customer Action" title={String(customerActionCount)} description="Waiting for customer review or acceptance.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Team Optix" title={String(teamOptixActionCount)} description="Customer accepted; Team Optix finalization pending.">
              <div />
            </WorkspaceSection>
          </section>

          <WorkspaceSection
            eyebrow="Execution Lane"
            title="Legal Readiness Queue"
            description="Locked client document versions that require customer action before final vaulting and Go Live readiness."
          >
            <div className="signal-list">
              {tasks.length ? (
                tasks.map((task) => {
                  const status = value(task, "status") ?? "READY_FOR_CUSTOMER_REVIEW";
                  const customerName = value(task, "customer_legal_name") ?? value(task, "company_name") ?? "Customer";
                  const documentTitle = value(task, "document_title") ?? "Client document";
                  const version = value(task, "version_label") ?? "—";
                  return (
                    <Link
                      key={String(task.id)}
                      className="signal-list__row"
                      href={documentHref(task)}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <div>
                        <strong>{customerName}</strong>
                        <span>{documentTitle} · v{version} · {value(task, "blocking_reason") ?? "Legal task active"}</span>
                      </div>
                      <em>{statusTone(status)}</em>
                    </Link>
                  );
                })
              ) : (
                <div className="signal-list__row">
                  <div>
                    <strong>No customer legal tasks yet</strong>
                    <span>Lock a client document version to create the first customer review task.</span>
                  </div>
                  <em>Empty</em>
                </div>
              )}
            </div>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
