import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { IntakeCapability, IntakeContract, IntakeLob, IntakeQuestion } from "../intake.types";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function readIntakeContract(client: Client = createSupabaseServiceRoleClient(), activeOnly = true): Promise<IntakeContract> {
  const [lobResult, capabilityResult, questionResult, lobCapabilityResult, questionLobResult, questionCapabilityResult] = await Promise.all([
    client.from("intake_lobs_v").select("id,industry_key,industry_label,description,is_active,sort_order").order("sort_order"),
    client.from("intake_capabilities_v").select("id,capability_key,capability_label,description,is_active,sort_order").order("sort_order"),
    client.from("intake_questions_v").select("id,question_key,label,helper_text,placeholder,field_type,is_required,scope,options_json,status,sort_order").order("sort_order"),
    client.from("intake_lob_capabilities_v").select("lob_id,capability_id"),
    client.from("intake_question_lobs_v").select("question_id,lob_id"),
    client.from("intake_question_capabilities_v").select("question_id,capability_id"),
  ]);
  for (const result of [lobResult, capabilityResult, questionResult, lobCapabilityResult, questionLobResult, questionCapabilityResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const linesOfBusiness: IntakeLob[] = (lobResult.data ?? []).filter((row) => !activeOnly || row.is_active).map((row) => ({ id: row.id, key: row.industry_key, label: row.industry_label, description: row.description, active: row.is_active, sortOrder: row.sort_order }));
  const capabilities: IntakeCapability[] = (capabilityResult.data ?? []).filter((row) => !activeOnly || row.is_active).map((row) => ({ id: row.id, key: row.capability_key, label: row.capability_label, description: row.description, active: row.is_active, sortOrder: row.sort_order, lobIds: (lobCapabilityResult.data ?? []).filter((link) => link.capability_id === row.id).map((link) => link.lob_id) }));
  const questions: IntakeQuestion[] = (questionResult.data ?? []).filter((row) => !activeOnly || row.status === "active").map((row) => ({ id: row.id, key: row.question_key, label: row.label, helperText: row.helper_text, placeholder: row.placeholder, fieldType: row.field_type as IntakeQuestion["fieldType"], required: row.is_required, scope: row.scope as IntakeQuestion["scope"], options: Array.isArray(row.options_json) ? row.options_json.filter((item): item is string => typeof item === "string") : [], status: row.status as IntakeQuestion["status"], sortOrder: row.sort_order, lobIds: (questionLobResult.data ?? []).filter((link) => link.question_id === row.id).map((link) => link.lob_id), capabilityIds: (questionCapabilityResult.data ?? []).filter((link) => link.question_id === row.id).map((link) => link.capability_id) }));
  return { linesOfBusiness, capabilities, questions };
}

export async function persistWorkspaceRequest(input: { companyName: string; ownerName: string; email: string; phone?: string; lobIds: string[]; capabilityIds: string[]; answers: Record<string, unknown> }, contract: IntakeContract) {
  const client = createSupabaseServiceRoleClient();
  const allowedLobs = new Set(contract.linesOfBusiness.map((item) => item.id));
  const allowedCapabilities = new Set(contract.capabilities.map((item) => item.id));
  const visibleQuestions = contract.questions.filter((question) => question.scope === "shared" || question.lobIds.some((id) => input.lobIds.includes(id)) || question.capabilityIds.some((id) => input.capabilityIds.includes(id)));
  if (input.lobIds.some((id) => !allowedLobs.has(id)) || input.capabilityIds.some((id) => !allowedCapabilities.has(id))) throw new Error("The intake selection is no longer available.");
  for (const question of visibleQuestions) if (question.required && !String(input.answers[question.id] ?? "").trim()) throw new Error(`${question.label} is required.`);
  const { data: requestId, error } = await client.rpc("submit_intake_workspace_request", { p_company_name: input.companyName, p_owner_name: input.ownerName, p_email: input.email, p_phone: input.phone || "", p_lob_ids: input.lobIds, p_capability_ids: input.capabilityIds, p_answers: input.answers, p_configuration_snapshot: contract });
  if (error || !requestId) throw new Error(error?.message ?? "Unable to save workspace request.");
  return requestId as string;
}
