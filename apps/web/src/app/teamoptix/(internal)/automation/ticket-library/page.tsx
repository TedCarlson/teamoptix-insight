import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import AutomationWorkbench from "@/features/teamoptix/automation/components/AutomationWorkbench";
import LiveExecutionPortals from "@/features/teamoptix/automation/components/LiveExecutionPortals";
import { OPERATIONS_COLLECTION_PAYLOAD_VERSION, runnerGoalForRequestType } from "@/features/automation/contracts/runnerGoal";
import { normalizeCollectionTarget } from "@/features/automation/contracts/collectionTarget";
import { listOperationsTicketTemplates, listTeamOptixCompanyOptions } from "@/features/teamoptix/automation/server/ticketControl.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function assertTargetedRecoveryDate(serviceDate: string) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const earliest = new Date(`${today}T12:00:00Z`);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1);
  const earliestIso = earliest.toISOString().slice(0, 10);

  if (!serviceDate) throw new Error("Select the exact service date.");
  if (serviceDate >= today) throw new Error("Targeted recovery only accepts prior service dates, not today or future dates.");
  if (serviceDate < earliestIso) throw new Error("Targeted recovery is limited to the last 12 months.");
}

type WorkbenchActionState = { status: "idle" | "success" | "error"; message: string; templateId?: string };

async function saveTicket(_previousState: WorkbenchActionState, formData: FormData): Promise<WorkbenchActionState> {
  "use server";
  try {
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
    if (requestType === "LAST_LOOK" && dateMode !== "TODAY") {
      throw new Error("Last Look must use Today.");
    }
    if (requestType === "TARGETED_RECOVERY" && dateMode !== "SELECTED_DATE") {
      throw new Error("Targeted Recovery must use one selected prior date.");
    }
    if (requestType === "HISTORICAL_BACKFILL" && dateMode !== "SELECTED_RANGE") {
      throw new Error("Historical Backfill must use a selected date range.");
    }

    const family = requestType === "HISTORICAL_BACKFILL" || requestType === "TARGETED_RECOVERY" ? "sweep" : "report";
    const templateId = value(formData, "templateId") || null;
    const { data: savedTemplateId, error } = await supabase.rpc("upsert_operations_ticket_template", {
      p_template_id: templateId,
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
    revalidatePath("/teamoptix/automation/assignments");
    revalidatePath("/teamoptix/automation");
    return { status: "success", message: templateId ? "Ticket changes saved." : "Ticket created.", templateId: String(savedTemplateId) };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The ticket could not be saved." };
  }
}

async function deleteTicket(_previousState: WorkbenchActionState, formData: FormData): Promise<WorkbenchActionState> {
  "use server";
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Unauthorized.");
    const templateId = value(formData, "templateId");
    if (!templateId) throw new Error("Ticket is required.");
    const { data, error } = await supabase.rpc("request_operations_ticket_template_deletion", {
      p_template_id: templateId,
    });
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as Record<string, unknown>;
    const active = Number(result.active_dependencies ?? 0);
    const assignments = Number(result.assignments_overridden ?? 0);
    revalidatePath("/teamoptix/automation/ticket-library");
    revalidatePath("/teamoptix/automation/assignments");
    revalidatePath("/teamoptix/automation");
    return active > 0
      ? { status: "success", message: `Ticket retired. ${assignments} assignment${assignments === 1 ? "" : "s"} stopped; deletion will finish after ${active} active run${active === 1 ? "" : "s"}.` }
      : { status: "success", message: `Ticket deleted. ${assignments} assignment${assignments === 1 ? "" : "s"} removed.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The ticket could not be deleted." };
  }
}

async function launchCollection(formData: FormData) {
  "use server";
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Unauthorized.");
  const { data: access, error: accessError } = await supabase.rpc("access_context");
  if (accessError) throw new Error(accessError.message);
  if (!access?.is_platform_owner) throw new Error("Only Team Optix platform owners can launch collection work.");

  const companyId = value(formData, "companyId");
  const templateId = value(formData, "templateId");
  const requestType = value(formData, "requestType").toUpperCase();
  const targetKey = value(formData, "targetKey");
  if (!["HISTORICAL_BACKFILL", "TARGETED_RECOVERY"].includes(requestType)) throw new Error("Unsupported live execution type.");

  const [{ data: company, error: companyError }, { data: template, error: templateError }] = await Promise.all([
    supabase.from("companies").select("company_slug").eq("id", companyId).single(),
    supabase.from("operations_ticket_template_v").select("id,template_key,template_name,default_priority,default_payload_json,is_active").eq("id", templateId).single(),
  ]);
  if (companyError || !company) throw new Error(companyError?.message || "Company not found.");
  if (templateError || !template) throw new Error(templateError?.message || "Published instruction not found.");
  const templatePayload = (template.default_payload_json ?? {}) as Record<string, any>;
  if (!template.is_active || templatePayload.request_type !== requestType) throw new Error("The selected published instruction does not match this execution portal.");
  const targets = Array.isArray(templatePayload.targets) ? templatePayload.targets : [];
  const selectedTarget = targets.find((item: any) => String(item?.key ?? "") === targetKey);
  const target = selectedTarget ? normalizeCollectionTarget(selectedTarget) : null;
  if (!target) throw new Error("The selected file is not authorized by this instruction.");

  const serviceDate = value(formData, "serviceDate") || null;
  const serviceDateStart = value(formData, "serviceDateStart") || null;
  const serviceDateEnd = value(formData, "serviceDateEnd") || null;
  if (requestType === "TARGETED_RECOVERY") assertTargetedRecoveryDate(serviceDate ?? "");
  if (requestType === "HISTORICAL_BACKFILL" && (!serviceDateStart || !serviceDateEnd || serviceDateStart > serviceDateEnd)) throw new Error("Select a valid inclusive historical range.");

  const requestPayload = {
    ...templatePayload,
    payload_contract_version: OPERATIONS_COLLECTION_PAYLOAD_VERSION,
    source: "teamoptix_automation_workbench",
    request_origin: "workbench_live_execution",
    request_type: requestType,
    date_mode: requestType === "HISTORICAL_BACKFILL" ? "SELECTED_RANGE" : "SELECTED_DATE",
    runner_goal: runnerGoalForRequestType(requestType),
    runner_goal_label: template.template_name,
    ticket_template_id: template.id,
    ticket_template_key: template.template_key,
    targets: [target],
    resolved_service_date: serviceDate,
    resolved_service_date_start: serviceDateStart,
    resolved_service_date_end: serviceDateEnd,
    date_selection_contract: requestType === "HISTORICAL_BACKFILL"
      ? { authority: "ticket_service_date_range", exact_start: serviceDateStart, exact_end: serviceDateEnd, instruction: "Collect one unchanged source artifact for every service date in this exact inclusive range." }
      : { authority: "ticket_service_date", exact_date: serviceDate, instruction: "Collect the unchanged source artifact for this exact service date." },
    ingestion_contract: {
      authority: "DSW_A1",
      expected_a1_date: requestType === "TARGETED_RECOVERY" ? serviceDate : null,
      expected_a1_date_start: requestType === "HISTORICAL_BACKFILL" ? serviceDateStart : null,
      expected_a1_date_end: requestType === "HISTORICAL_BACKFILL" ? serviceDateEnd : null,
      required_snapshot_kind: "FINAL",
      instruction: "Pass every downloaded workbook through unchanged. Ingestion reads A1 and is the sole authority for activity date and FINAL classification.",
    },
  };
  const requestedReport = String(target.report_family_key ?? target.artifact_key ?? "").toUpperCase();
  const { error } = await supabase.rpc("create_operations_collection_request", {
    p_company_slug: company.company_slug,
    p_request_type: requestType,
    p_service_date: serviceDate,
    p_service_date_start: serviceDateStart,
    p_service_date_end: serviceDateEnd,
    p_requested_reports: [requestedReport],
    p_priority: Number(template.default_priority ?? 100),
    p_request_payload: requestPayload,
  });
  if (error) throw new Error(error.message);
  redirect("/teamoptix/automation/collections");
}

export default async function Page() {
  const [templates, companies] = await Promise.all([listOperationsTicketTemplates(), listTeamOptixCompanyOptions()]);
  return <TeamOptixShell><main className="workspace-shell"><section className="workspace-main">
    <header className="automation-domain-header"><span className="workspace-eyebrow">TeamOptix · Automation</span><h1>Automation Workbench</h1><p>Author operational instructions in plain language. Insight translates them into governed runner contracts.</p></header>
    <LiveExecutionPortals companies={companies} templates={templates} launchAction={launchCollection} />
    <AutomationWorkbench templates={templates} saveAction={saveTicket} deleteAction={deleteTicket} />
  </section></main></TeamOptixShell>;
}
