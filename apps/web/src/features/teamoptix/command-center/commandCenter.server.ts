import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type Company = {
  id: string;
  company_name: string | null;
  company_slug: string;
  company_status: string;
};

type Activation = {
  company_id: string;
  lifecycle_status: string;
  last_transition_at: string;
};

type Readiness = {
  company_id: string;
  readiness_key: string;
  status: string;
  is_blocking: boolean;
  blocking_reason: string | null;
};

export type GovernedCompany = Company & {
  lifecycle_status: string;
  blocker_count: number;
  readiness_complete: number;
  readiness_total: number;
  last_transition_at: string | null;
};

export type CommandCenterSnapshot = {
  companies: GovernedCompany[];
  legal: {
    open: number;
    customer_action: number;
    teamoptix_action: number;
  };
  automation: {
    successful_7d: number;
    failed_7d: number;
    reliability: number | null;
    daily: Array<{ date: string; successful: number; failed: number }>;
  };
  collections: {
    completed_today: number;
    failed_today: number;
    awaiting_ingestion: number;
    ingested_today: number;
  };
  attention: Array<{
    key: string;
    priority: "High" | "Medium";
    company_name: string;
    message: string;
    detail: string;
    href: string;
  }>;
};

function dayKey(value: string) {
  return value.slice(0, 10);
}

export async function getGovernedCompanies(): Promise<GovernedCompany[]> {
  const db = createSupabaseServiceRoleClient();
  const [{ data: activations }, { data: assignments }] = await Promise.all([
    db.schema("commercial").from("company_activation").select("company_id, lifecycle_status, last_transition_at"),
    db.from("company_operations_ticket_assignment_v").select("company_id").eq("is_enabled", true),
  ]);

  const activationRows = (activations ?? []) as Activation[];
  const governedIds = new Set<string>([
    ...activationRows.map((row) => row.company_id),
    ...(assignments ?? []).map((row) => String(row.company_id)),
  ]);

  if (governedIds.size === 0) return [];

  const [{ data: companies }, { data: readiness }] = await Promise.all([
    db.from("companies").select("id, company_name, company_slug, company_status").in("id", [...governedIds]),
    db.schema("commercial").from("company_activation_readiness").select("company_id, readiness_key, status, is_blocking, blocking_reason").in("company_id", [...governedIds]),
  ]);

  const activationByCompany = new Map(activationRows.map((row) => [row.company_id, row]));
  const readinessRows = (readiness ?? []) as Readiness[];

  return ((companies ?? []) as Company[])
    .map((company) => {
      const activation = activationByCompany.get(company.id);
      const companyReadiness = readinessRows.filter((row) => row.company_id === company.id);
      return {
        ...company,
        lifecycle_status: activation?.lifecycle_status ?? "automation_enabled",
        blocker_count: companyReadiness.filter((row) => row.is_blocking && row.status === "incomplete").length,
        readiness_complete: companyReadiness.filter((row) => row.status !== "incomplete").length,
        readiness_total: companyReadiness.length,
        last_transition_at: activation?.last_transition_at ?? null,
      };
    })
    .sort((a, b) => (a.company_name ?? a.company_slug).localeCompare(b.company_name ?? b.company_slug));
}

export async function getCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const db = createSupabaseServiceRoleClient();
  const companies = await getGovernedCompanies();
  const companyIds = companies.map((company) => company.id);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  const [{ data: legalTasks }, { data: runs }, { data: requests }, { data: artifacts }] = await Promise.all([
    db.from("legal_customer_legal_task_v").select("id, company_id, company_name, status, blocking_reason, document_title"),
    companyIds.length
      ? db.from("operations_automation_run_v").select("id, company_id, company_slug, status, started_at, error_message, automation_type").in("company_id", companyIds).gte("started_at", sevenDaysAgo.toISOString())
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? db.from("operations_collection_request_v").select("id, company_id, company_slug, request_status, request_type, completed_at, error_message, created_at").in("company_id", companyIds).gte("created_at", `${today}T00:00:00.000Z`)
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? db.from("operations_collection_artifact_v").select("id, company_id, company_slug, artifact_status, updated_at").in("company_id", companyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const scopedLegal = (legalTasks ?? []).filter((row) => companyIds.includes(String(row.company_id)));
  const openLegal = scopedLegal.filter((row) => !["EXECUTED_AND_VAULTED", "CANCELLED"].includes(String(row.status)));
  const runRows = runs ?? [];
  const successRuns = runRows.filter((row) => ["COMPLETE", "SUCCESS", "SUCCEEDED"].includes(String(row.status).toUpperCase()));
  const failedRuns = runRows.filter((row) => String(row.status).toUpperCase() === "FAILED");
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sevenDaysAgo);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      successful: successRuns.filter((row) => dayKey(String(row.started_at)) === key).length,
      failed: failedRuns.filter((row) => dayKey(String(row.started_at)) === key).length,
    };
  });

  const requestRows = requests ?? [];
  const artifactRows = artifacts ?? [];
  const attention: CommandCenterSnapshot["attention"] = [];

  for (const company of companies) {
    if (company.blocker_count > 0) {
      attention.push({
        key: `readiness:${company.id}`,
        priority: "High",
        company_name: company.company_name ?? company.company_slug,
        message: `${company.blocker_count} Go Live readiness blocker${company.blocker_count === 1 ? "" : "s"}`,
        detail: `${company.readiness_complete} of ${company.readiness_total} readiness domains complete`,
        href: `/teamoptix/customers/${company.company_slug}`,
      });
    }
  }

  for (const task of openLegal.slice(0, 4)) {
    const company = companies.find((item) => item.id === String(task.company_id));
    attention.push({
      key: `legal:${task.id}`,
      priority: String(task.status) === "CUSTOMER_ACCEPTED" ? "High" : "Medium",
      company_name: String(task.company_name ?? company?.company_name ?? "Customer"),
      message: String(task.status) === "CUSTOMER_ACCEPTED" ? "Agreement ready for Team Optix execution" : "Agreement awaiting customer action",
      detail: String(task.document_title ?? task.blocking_reason ?? "Customer legal task"),
      href: "/teamoptix/business/contracts/tasks",
    });
  }

  for (const run of failedRuns.slice(-3).reverse()) {
    const company = companies.find((item) => item.id === String(run.company_id));
    attention.push({
      key: `run:${run.id}`,
      priority: "High",
      company_name: company?.company_name ?? String(run.company_slug ?? "Customer"),
      message: `${String(run.automation_type).replaceAll("_", " ")} failed`,
      detail: String(run.error_message ?? "Automation run requires inspection"),
      href: "/teamoptix/automation/telemetry",
    });
  }

  return {
    companies,
    legal: {
      open: openLegal.length,
      customer_action: scopedLegal.filter((row) => row.status === "READY_FOR_CUSTOMER_REVIEW").length,
      teamoptix_action: scopedLegal.filter((row) => row.status === "CUSTOMER_ACCEPTED").length,
    },
    automation: {
      successful_7d: successRuns.length,
      failed_7d: failedRuns.length,
      reliability: runRows.length ? Math.round((successRuns.length / runRows.length) * 1000) / 10 : null,
      daily,
    },
    collections: {
      completed_today: requestRows.filter((row) => row.request_status === "COMPLETE").length,
      failed_today: requestRows.filter((row) => row.request_status === "FAILED").length,
      awaiting_ingestion: artifactRows.filter((row) => ["UPLOADED", "READY_FOR_INGEST", "INGESTING"].includes(String(row.artifact_status))).length,
      ingested_today: artifactRows.filter((row) => row.artifact_status === "INGESTED" && dayKey(String(row.updated_at)) === today).length,
    },
    attention: attention.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "High" ? -1 : 1)).slice(0, 8),
  };
}
