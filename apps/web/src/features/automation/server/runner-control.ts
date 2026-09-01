import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceRoleClient = ReturnType<
  typeof createSupabaseServiceRoleClient
>;

export async function resolveAssignedOperationsRunnerKey(
  service: ServiceRoleClient,
  companySlug: string
) {
  const { data, error } = await service
    .from("operations_runner_fleet_v")
    .select("runner_key")
    .eq("company_slug", companySlug)
    .eq("runner_role", "DEDICATED")
    .eq("assignment_kind", "DEDICATED")
    .in("assignment_status", ["ACTIVE", "DRAINING"])
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.runner_key) {
    throw new Error("No active dedicated runner is assigned to this company.");
  }
  return String(data.runner_key);
}

export async function loadAssignedOperationsRunnerSchedule(
  service: ServiceRoleClient,
  companySlug: string
) {
  const runnerKey = await resolveAssignedOperationsRunnerKey(
    service,
    companySlug
  );
  const { data, error } = await service
    .from("operations_runner_schedule_v")
    .select("*")
    .eq("runner_key", runnerKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return { runnerKey, schedule: data ?? null };
}
