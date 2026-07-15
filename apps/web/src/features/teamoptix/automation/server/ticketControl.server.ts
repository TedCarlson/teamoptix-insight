import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type OperationsTicketTemplateRow = {
  id: string;
  template_key: string;
  template_name: string;
  ticket_family: string;
  execution_lane: string;
  description: string | null;
  default_priority: number;
  default_collection_mode: string | null;
  default_manifest_types: string[] | null;
  default_skip_combined: boolean;
  default_payload_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyOperationsTicketAssignmentRow = {
  id: string;
  company_id: string;
  company_name: string | null;
  company_slug: string;
  template_id: string;
  template_key: string;
  template_name: string;
  ticket_family: string;
  execution_lane: string;
  operational_contract: string;
  cook_key: string;
  artifact_keys: string[];
  active_start_date: string;
  inactive_end_date: string | null;
  release_order: number;
  operator_notes: string | null;
  assignment_status: string;
  is_enabled: boolean;
  generation_mode: string;
  cadence_minutes: number | null;
  window_preset: string;
  start_time: string | null;
  end_time: string | null;
  priority_override: number | null;
  effective_priority: number;
  route_scope: string;
  route_limit: number | null;
  assignment_payload_json: Record<string, unknown> | null;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamOptixCompanyOption = {
  id: string;
  company_slug: string;
  company_name: string | null;
};

export async function listOperationsTicketTemplates() {
  const db = createSupabaseServiceRoleClient();

  const { data, error } = await db
    .from("operations_ticket_template_v")
    .select("*")
    .order("ticket_family", { ascending: true })
    .order("template_key", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OperationsTicketTemplateRow[];
}

export async function listCompanyOperationsTicketAssignments() {
  const db = createSupabaseServiceRoleClient();

  const { data, error } = await db
    .from("company_operations_ticket_assignment_v")
    .select("*")
    .order("company_slug", { ascending: true })
    .order("release_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CompanyOperationsTicketAssignmentRow[];
}

export async function listTeamOptixCompanyOptions() {
  const db = createSupabaseServiceRoleClient();

  const { data, error } = await db
    .from("companies")
    .select("id, company_slug, company_name")
    .order("company_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TeamOptixCompanyOption[];
}
