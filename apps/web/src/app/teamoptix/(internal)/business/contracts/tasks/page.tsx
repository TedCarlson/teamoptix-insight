import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

async function finalizeLegalTask(formData: FormData) {
  "use server";

  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Unauthorized.");
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    throw new Error(accessError.message);
  }

  if (!access?.is_platform_owner) {
    throw new Error("Only Team Optix platform owners can finalize legal tasks.");
  }

  const db = createSupabaseServiceRoleClient();

  const { data: task, error: taskError } = await db
    .from("legal_customer_legal_task_v")
    .select("id, status")
    .eq("id", taskId)
    .single();

  if (taskError) {
    throw new Error(taskError.message);
  }

  const status = typeof task?.status === "string" ? task.status : null;

  if (status !== "CUSTOMER_ACCEPTED") {
    throw new Error("Legal task is not ready for Team Optix finalization.");
  }

  const { error: updateError } = await db
    .schema("legal")
    .from("customer_legal_task")
    .update({
      status: "EXECUTED_AND_VAULTED",
      teamoptix_executed_at: new Date().toISOString(),
      teamoptix_executed_by: session.user.id,
      completed_at: new Date().toISOString(),
      blocking_reason: "Legal execution complete and vault evidence recorded.",
    })
    .eq("id", taskId)
    .eq("status", "CUSTOMER_ACCEPTED");

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/teamoptix/business/contracts");
  revalidatePath("/teamoptix/business/contracts/tasks");
  redirect("/teamoptix/business/contracts/tasks");
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
                    <div
                      key={String(task.id)}
                      className="signal-list__row"
                    >
                      <Link
                        href={documentHref(task)}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        <div>
                          <strong>{customerName}</strong>
                          <span>{documentTitle} · v{version} · {value(task, "blocking_reason") ?? "Legal task active"}</span>
                        </div>
                      </Link>

                      <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
                        <em>{statusTone(status)}</em>
                        {status === "CUSTOMER_ACCEPTED" ? (
                          <form action={finalizeLegalTask}>
                            <input type="hidden" name="taskId" value={String(task.id)} />
                            <button className="primary-action" type="submit">
                              Finalize
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
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
