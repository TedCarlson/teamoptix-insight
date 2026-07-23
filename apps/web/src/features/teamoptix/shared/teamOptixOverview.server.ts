import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";
import { isActiveCollectionRequest, isCleanCompleteCollectionRequest, isCollectionRequestException } from "@/features/automation/lib/collectionRequestOutcome";

export async function getBusinessOverview() {
  const db = createSupabaseServiceRoleClient();
  const [{ data: tasks }, { data: documents }, { data: versions }, { data: payments }] = await Promise.all([
    db.from("legal_customer_legal_task_v").select("id, company_name, document_title, status, blocking_reason"),
    db.from("legal_document_v").select("id, title, document_key, status, document_scope"),
    db.from("legal_document_version_v").select("id, status, created_at"),
    db.schema("billing").from("payment").select("id, amount, payment_status, payment_purpose, created_at"),
  ]);
  const openTasks = (tasks ?? []).filter((row) => !["EXECUTED_AND_VAULTED", "CANCELLED"].includes(String(row.status)));
  const paid = (payments ?? []).filter((row) => row.payment_status === "paid");
  return {
    openTasks,
    documents: documents ?? [],
    lockedVersions: (versions ?? []).filter((row) => row.status === "LOCKED"),
    paid,
    teamAction: openTasks.filter((row) => row.status === "CUSTOMER_ACCEPTED").length,
    customerAction: openTasks.filter((row) => row.status === "READY_FOR_CUSTOMER_REVIEW").length,
  };
}

export async function getAutomationOverview() {
  const db = createSupabaseServiceRoleClient();
  const companies = await getGovernedCompanies();
  const ids = companies.map((company) => company.id);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: templates }, { data: assignments }, { data: requests }, { data: runs }, { data: artifacts }] = await Promise.all([
    db.from("operations_ticket_template_v").select("id, is_active"),
    db.from("company_operations_ticket_assignment_v").select("id, is_enabled, company_id"),
    ids.length ? db.from("operations_collection_request_v").select("id, request_status, company_slug, request_type, error_message, created_at, duration_ms, registered_count, ingested_count").in("company_id", ids).gte("created_at", since).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? db.from("operations_automation_run_v").select("id, status, company_slug, automation_type, error_message, started_at").in("company_id", ids).gte("started_at", since).order("started_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? db.from("operations_collection_artifact_v").select("id, collection_request_id, artifact_status, company_slug, normalized_filename, runner_elapsed_ms, ingest_completed_at, updated_at").in("company_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const runRows = runs ?? [];
  const requestRows = requests ?? [];
  return {
    templates: (templates ?? []).filter((row) => row.is_active).length,
    assignments: (assignments ?? []).filter((row) => row.is_enabled && ids.includes(String(row.company_id))).length,
    requests: requestRows,
    failedRequests: requestRows.filter(isCollectionRequestException),
    successfulRequests: requestRows.filter(isCleanCompleteCollectionRequest),
    activeRequests: requestRows.filter(isActiveCollectionRequest),
    runs: runRows,
    artifacts: artifacts ?? [],
    failedRuns: runRows.filter((row) => String(row.status).toUpperCase() === "FAILED"),
    successfulRuns: runRows.filter((row) => ["COMPLETE", "SUCCESS", "SUCCEEDED"].includes(String(row.status).toUpperCase())),
    awaitingArtifacts: (artifacts ?? []).filter((row) => ["UPLOADED", "READY_FOR_INGEST", "INGESTING"].includes(String(row.artifact_status))).length,
  };
}
