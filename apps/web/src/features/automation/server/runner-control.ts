import { createHmac } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const OPERATIONS_RUNNER_KEY =
  process.env.OPERATIONS_RUNNER_KEY ?? "vps-laravel-runner-001";

type ServiceRoleClient = ReturnType<
  typeof createSupabaseServiceRoleClient
>;

export async function pushOperationsRunnerSchedule(
  service: ServiceRoleClient
) {
  const controlUrl = process.env.OPERATIONS_RUNNER_CONTROL_URL;
  const controlSecret = process.env.OPERATIONS_RUNNER_CONTROL_SECRET;

  if (!controlUrl || !controlSecret) {
    throw new Error("Runner control environment is not configured.");
  }

  const { data: schedule, error: scheduleError } = await service.rpc(
    "get_operations_runner_bootstrap",
    { p_runner_key: OPERATIONS_RUNNER_KEY }
  );
  if (scheduleError) throw new Error(scheduleError.message);
  if (!schedule) throw new Error("Runner schedule is not configured.");

  const payload = JSON.stringify(schedule);
  const signature = createHmac("sha256", controlSecret)
    .update(payload)
    .digest("hex");
  const runnerResponse = await fetch(controlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TeamOptix-Signature": `sha256=${signature}`,
    },
    body: payload,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const runnerResult = await runnerResponse.json().catch(() => ({}));

  if (!runnerResponse.ok || !runnerResult?.ok) {
    throw new Error(
      runnerResult?.error ??
        `Runner control returned ${runnerResponse.status}.`
    );
  }

  return runnerResult;
}
