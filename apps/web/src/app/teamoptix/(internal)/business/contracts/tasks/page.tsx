import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getCustomerLegalTasks } from "@/features/legal/server/legal.repository";

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

function statusClass(status: string) {
  if (status === "READY_FOR_CUSTOMER_REVIEW") return "signal-pill signal-pill--degraded";
  if (status === "CUSTOMER_ACCEPTED") return "signal-pill signal-pill--healthy";
  if (status === "EXECUTED_AND_VAULTED") return "signal-pill signal-pill--healthy";
  if (status === "CANCELLED") return "signal-pill signal-pill--unknown";
  return "signal-pill";
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

  const { data: result, error: finalizeError } = await db.rpc(
    "legal_finalize_customer_task",
    {
      p_task_id: taskId,
      p_executed_by: session.user.id,
    },
  );

  if (finalizeError) {
    throw new Error(finalizeError.message);
  }

  const finalization = result as { ok?: boolean; error?: string } | null;

  if (!finalization?.ok) {
    throw new Error(finalization?.error ?? "Legal task finalization failed.");
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
  const completedTasks = tasks.filter((task) => value(task, "status") === "EXECUTED_AND_VAULTED");
  const historyTasks = tasks.filter((task) => {
    const status = value(task, "status");
    return status === "EXECUTED_AND_VAULTED" || status === "CANCELLED";
  });

  return (
    <TeamOptixShell>
      <main className="workspace-shell teamoptix-domain-overview legal-tasks-workspace">
        <section className="workspace-main">
          <header className="legal-tasks-heading">
            <div>
              <p className="eyebrow">TeamOptix · Business · Contracts</p>
              <h1>Legal execution</h1>
              <p>Customer acceptance, Team Optix finalization, and durable contract evidence.</p>
            </div>
            <Link className="secondary-action" href="/teamoptix/business/contracts">
                Back to Contracts
            </Link>
          </header>

          <section className="operating-pulse legal-tasks-pulse" aria-label="Legal execution pulse">
            <article><span>Open Tasks</span><strong>{openTasks.length}</strong><small>Active execution obligations</small></article>
            <article><span>Customer Action</span><strong>{customerActionCount}</strong><small>{customerActionCount ? "Review or acceptance required" : "Customer queue clear"}</small></article>
            <article><span>Team Optix Action</span><strong>{teamOptixActionCount}</strong><small>{teamOptixActionCount ? "Finalization required" : "Finalization queue clear"}</small></article>
            <article><span>Vaulted</span><strong>{completedTasks.length}</strong><small>Completed legal records</small></article>
          </section>

          <section className="command-panel legal-tasks-panel">
            <div className="command-panel__header">
              <div><p className="value-card__eyebrow">Execution Queue</p><h2>Contracts requiring action</h2></div>
              <span>{openTasks.length} open</span>
            </div>
            <div className="domain-row-list">
              {openTasks.length ? (
                openTasks.map((task) => {
                  const status = value(task, "status") ?? "READY_FOR_CUSTOMER_REVIEW";
                  const customerName = value(task, "customer_legal_name") ?? value(task, "company_name") ?? "Customer";
                  const documentTitle = value(task, "document_title") ?? "Client document";
                  const version = value(task, "version_label") ?? "—";
                  return (
                    <div key={String(task.id)} className="legal-task-row">
                      <Link href={documentHref(task)}>
                        <span>
                          <strong>{customerName}</strong>
                          <small>{documentTitle} · v{version} · {value(task, "blocking_reason") ?? "Legal task active"}</small>
                        </span>
                      </Link>
                      <div className="legal-task-actions">
                        <em className={statusClass(status)}>{statusTone(status)}</em>
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
                <div className="command-empty">
                  <strong>Execution queue clear</strong>
                  <span>New obligations appear when a locked client document is released for customer review.</span>
                </div>
              )}
            </div>
          </section>

          {historyTasks.length ? (
            <section className="command-panel legal-tasks-panel legal-tasks-history">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">History</p><h2>Completed and superseded</h2></div>
                <span>{historyTasks.length} records</span>
              </div>
              <div className="domain-row-list">
                {historyTasks.map((task) => {
                  const status = value(task, "status") ?? "CANCELLED";
                  return (
                    <Link className="domain-row" href={documentHref(task)} key={String(task.id)}>
                      <span>
                        <strong>{value(task, "customer_legal_name") ?? value(task, "company_name") ?? "Customer"}</strong>
                        <small>{value(task, "document_title") ?? "Client document"} · v{value(task, "version_label") ?? "—"} · {value(task, "blocking_reason") ?? statusTone(status)}</small>
                      </span>
                      <em className={statusClass(status)}>{statusTone(status)}</em>
                      <b>→</b>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </section>
      </main>
    </TeamOptixShell>
  );
}
