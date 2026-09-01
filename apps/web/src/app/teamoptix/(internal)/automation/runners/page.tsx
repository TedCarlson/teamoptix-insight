import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";
import LocalDateTime from "@/features/automation/components/LocalDateTime";
import type { RunnerFleetControlRow } from "@/features/automation/runnerFleetControl";
import RunnerFleetControls from "@/features/teamoptix/automation/components/RunnerFleetControls";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

function eventStatus(level: unknown) {
  const value = String(level ?? "INFO").toUpperCase();
  if (value === "ERROR") return "Failed";
  if (value === "WARN") return "Degraded";
  return "Healthy";
}

function currentEpochMs() {
  return Date.now();
}

export default async function Page() {
  const data = await getAutomationOverview();
  const db = createSupabaseServiceRoleClient();
  const nowMs = currentEpochMs();
  const since = new Date(nowMs - RECENT_WINDOW_MS).toISOString();
  const [fleetResult, scheduleResult, logResult] = await Promise.all([
    db
      .from("operations_runner_fleet_v")
      .select(
        "runner_id,runner_key,display_name,runner_role,environment,lifecycle_state,software_version,last_heartbeat_at,assignment_id,assignment_kind,assignment_status,assignment_version,assignment_expires_at,company_slug,company_name,terminal_code,terminal_name,collection_enabled,config_version,applied_version,runner_state,runner_last_seen_at,runner_last_error,latest_command_id,latest_command_type,latest_command_state,latest_command_requested_at,latest_command_acknowledged_at,latest_command_completed_at"
      )
      .order("display_name", { ascending: true }),
    db
      .from("operations_runner_schedule_v")
      .select("runner_key, company_slug, collection_enabled, runner_state, runner_last_seen_at, runner_last_error")
      .order("company_slug", { ascending: true }),
    db
      .from("operations_runner_log_event_v")
      .select("id, runner_key, company_slug, cycle_id, collection_request_id, request_type, request_status, occurred_at, level, stream, message, sequence")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(1000),
  ]);

  const schedules = scheduleResult.data ?? [];
  const logs = logResult.data ?? [];
  const canonicalFleet = (fleetResult.data ?? []) as RunnerFleetControlRow[];
  const fleet: RunnerFleetControlRow[] = canonicalFleet.length
    ? canonicalFleet
    : schedules.map((runner: any) => ({
        runner_id: null,
        runner_key: String(runner.runner_key),
        display_name: "Team Optix · Legacy support runner",
        runner_role: "SUPPORT",
        environment: "prod",
        lifecycle_state: "DISABLED",
        software_version: null,
        last_heartbeat_at: runner.runner_last_seen_at,
        assignment_id: null,
        assignment_kind: null,
        assignment_status: null,
        assignment_version: null,
        assignment_expires_at: null,
        company_slug: runner.company_slug,
        company_name: null,
        terminal_code: null,
        terminal_name: null,
        collection_enabled: runner.collection_enabled,
        config_version: null,
        applied_version: null,
        runner_state: runner.runner_state,
        runner_last_seen_at: runner.runner_last_seen_at,
        runner_last_error: runner.runner_last_error,
        latest_command_id: null,
        latest_command_type: null,
        latest_command_state: null,
        latest_command_requested_at: null,
        latest_command_acknowledged_at: null,
        latest_command_completed_at: null,
      }));
  const active = data.requests.filter((row: any) =>
    ["CLAIMED", "RUNNING", "ARTIFACTS_READY", "INGESTING"].includes(row.request_status)
  );
  const online = fleet.filter((row) => {
    const lastSeen = new Date(
      String(row.last_heartbeat_at ?? row.runner_last_seen_at ?? "")
    ).getTime();
    return Number.isFinite(lastSeen) && nowMs - lastSeen <= ONLINE_WINDOW_MS;
  });

  const recentCycles = Array.from(
    logs.reduce((cycles: Map<string, any>, event: any) => {
      const current = cycles.get(event.cycle_id);
      if (!current) {
        cycles.set(event.cycle_id, {
          ...event,
          count: 1,
          errorCount: String(event.level).toUpperCase() === "ERROR" ? 1 : 0,
          warningCount: String(event.level).toUpperCase() === "WARN" ? 1 : 0,
        });
        return cycles;
      }
      current.count += 1;
      if (String(event.level).toUpperCase() === "ERROR") current.errorCount += 1;
      if (String(event.level).toUpperCase() === "WARN") current.warningCount += 1;
      return cycles;
    }, new Map<string, any>()).values()
  ).slice(0, 12);

  return (
    <TeamOptixDomainOverview
      eyebrow="TeamOptix · Automation"
      title="Runner fleet"
      description="See runner presence and failure audit trails here—without opening a remote terminal."
      metrics={[
        { label: "Configured runners", value: fleet.length, detail: "Governed runner identities" },
        { label: "Seen in 10 minutes", value: online.length, detail: "Runner control-plane presence" },
        { label: "24-hour failures", value: recentCycles.length, detail: `${logs.length} bounded audit events` },
        { label: "Active collections", value: active.length, detail: "Queued through ingestion" },
      ]}
      panels={[
        {
          eyebrow: "Runner presence",
          title: "Configured fleet",
          rows: fleet.length
            ? fleet.map((runner) => {
                const lastSeen = new Date(String(runner.last_heartbeat_at ?? runner.runner_last_seen_at ?? "")).getTime();
                const isOnline = Number.isFinite(lastSeen) && nowMs - lastSeen <= ONLINE_WINDOW_MS;
                return {
                  id: runner.runner_key,
                  title: runner.display_name,
                  detail: runner.last_heartbeat_at || runner.runner_last_seen_at ? (
                    <>Last evidence <LocalDateTime value={String(runner.last_heartbeat_at ?? runner.runner_last_seen_at)} /></>
                  ) : "No runner evidence received yet",
                  status: runner.runner_last_error ? "Degraded" : isOnline ? "Healthy" : "Unknown",
                  href: "/teamoptix/automation/runners",
                };
              })
            : [{
                title: "No configured runners",
                detail: scheduleResult.error ? "Runner schedules could not be loaded" : "No governed runner identities exist",
                status: "Unknown",
                href: "/teamoptix/automation/company-assignments",
              }],
        },
        {
          eyebrow: "Failure audit",
          title: "Recent runner failures",
          actionLabel: "All collections",
          actionHref: "/teamoptix/automation/collections",
          rows: recentCycles.length
            ? recentCycles.map((cycle: any) => ({
                id: cycle.cycle_id,
                title: `${String(cycle.request_type ?? "Runner cycle").replaceAll("_", " ")} · ${cycle.company_slug}`,
                detail: (
                  <>
                    <LocalDateTime value={String(cycle.occurred_at)} /> · {cycle.count} events
                    {cycle.errorCount ? ` · ${cycle.errorCount} errors` : cycle.warningCount ? ` · ${cycle.warningCount} warnings` : ""}
                    {` · ${cycle.message}`}
                  </>
                ),
                status: cycle.errorCount ? "Failed" : cycle.warningCount ? "Degraded" : eventStatus(cycle.level),
                href: cycle.collection_request_id
                  ? `/teamoptix/automation/collections/${cycle.collection_request_id}`
                  : "/teamoptix/automation/collections",
              }))
            : [{
                title: "No runner failure audits in the last 24 hours",
                detail: logResult.error
                  ? "Runner failure-audit storage is not available yet"
                  : "Successful cycles are represented by their terminal receipts",
                status: "Unknown",
                href: "/teamoptix/automation/collections",
              }],
        },
      ]}
    >
      {fleet.length ? <RunnerFleetControls runners={fleet} /> : null}
    </TeamOptixDomainOverview>
  );
}
