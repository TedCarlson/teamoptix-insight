import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import AutomationWorkbench from "@/features/teamoptix/automation/components/AutomationWorkbench";
import { listOperationsTicketTemplates } from "@/features/teamoptix/automation/server/ticketControl.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function saveTicket(formData: FormData) {
  "use server";

  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Unauthorized.");

  const payloadText = value(formData, "payload");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(payloadText); } catch { throw new Error("The compiled runner instruction is invalid."); }

  const reports = value(formData, "reports").split(",").filter(Boolean);
  if (reports.length === 0) throw new Error("Select at least one report or manifest.");

  const requestType = value(formData, "requestType");
  const dateMode = value(formData, "dateMode");
  if (requestType === "PREVIOUS_DAY_CLOSE" && dateMode !== "YESTERDAY") {
    throw new Error("Previous Day Close must use Yesterday only. Use Historical Recovery for a date range.");
  }

  const family = requestType === "HISTORICAL_BACKFILL" || requestType === "TARGETED_RECOVERY" ? "sweep" : "report";
  const { error } = await supabase.rpc("upsert_operations_ticket_template", {
    p_template_id: value(formData, "templateId") || null,
    p_template_key: value(formData, "templateKey"),
    p_template_name: value(formData, "templateName"),
    p_ticket_family: family,
    p_execution_lane: "operations_collection_request",
    p_description: value(formData, "description"),
    p_default_priority: Number(value(formData, "priority") || 100),
    p_default_collection_mode: dateMode,
    p_default_manifest_types: reports.filter((item) => item.includes("MANIFEST")).map((item) => item.replace("_MANIFEST", "").toLowerCase()),
    p_default_skip_combined: true,
    p_default_payload_json: payload,
    p_is_active: formData.get("isActive") === "on",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/teamoptix/automation/ticket-library");
  revalidatePath("/teamoptix/automation");
  redirect("/teamoptix/automation/ticket-library");
}

export default async function Page() {
  const templates = await listOperationsTicketTemplates();
  return <TeamOptixShell><main className="workspace-shell"><section className="workspace-main">
    <header className="automation-domain-header"><span className="workspace-eyebrow">TeamOptix · Automation</span><h1>Automation Workbench</h1><p>Author operational instructions in plain language. Insight translates them into governed runner contracts.</p></header>
    <AutomationWorkbench templates={templates} saveAction={saveTicket} />
  </section></main></TeamOptixShell>;
}
