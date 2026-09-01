export const RUNNER_CONTROL_COMMANDS = [
  "PAUSE",
  "DRAIN_STOP",
  "EMERGENCY_STOP",
  "RESUME",
] as const;

export type RunnerControlCommand = (typeof RUNNER_CONTROL_COMMANDS)[number];

export type RunnerCommandRequest = {
  companySlug: string;
  runnerId: string;
  assignmentId: string;
  commandType: RunnerControlCommand;
  expectedAssignmentVersion: number;
  expectedConfigVersion: number;
  reason: string | null;
  idempotencyKey: string | null;
};

export type RunnerFleetControlRow = {
  runner_id: string | null;
  runner_key: string;
  display_name: string;
  runner_role: "DEDICATED" | "SUPPORT";
  environment: string;
  lifecycle_state: string;
  software_version: string | null;
  last_heartbeat_at: string | null;
  assignment_id: string | null;
  assignment_kind: "DEDICATED" | "SUPPORT" | null;
  assignment_status: string | null;
  assignment_version: number | null;
  assignment_expires_at: string | null;
  company_slug: string | null;
  company_name: string | null;
  terminal_code: string | null;
  terminal_name: string | null;
  collection_enabled: boolean | null;
  config_version: number | null;
  applied_version: number | null;
  runner_state: string | null;
  runner_last_seen_at: string | null;
  runner_last_error: string | null;
  latest_command_id: string | null;
  latest_command_type: RunnerControlCommand | null;
  latest_command_state: string | null;
  latest_command_requested_at: string | null;
  latest_command_acknowledged_at: string | null;
  latest_command_completed_at: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseRunnerCommandRequest(value: unknown):
  | { ok: true; value: RunnerCommandRequest }
  | { ok: false; error: string } {
  const input = record(value);
  if (!input) return { ok: false, error: "A command payload is required." };

  const companySlug = String(input.company_slug ?? "").trim();
  const runnerId = String(input.runner_id ?? "").trim();
  const assignmentId = String(input.assignment_id ?? "").trim();
  const commandType = String(input.command_type ?? "").trim().toUpperCase();
  const expectedAssignmentVersion = integer(
    input.expected_assignment_version
  );
  const expectedConfigVersion = integer(input.expected_config_version);
  const reason = String(input.reason ?? "").trim() || null;
  const idempotencyKey =
    String(input.idempotency_key ?? "").trim() || null;

  if (!SLUG_PATTERN.test(companySlug)) {
    return { ok: false, error: "A valid company is required." };
  }
  if (!UUID_PATTERN.test(runnerId) || !UUID_PATTERN.test(assignmentId)) {
    return {
      ok: false,
      error: "The runner assignment is missing or invalid.",
    };
  }
  if (
    !RUNNER_CONTROL_COMMANDS.includes(
      commandType as RunnerControlCommand
    )
  ) {
    return { ok: false, error: "The runner command is not supported." };
  }
  if (
    expectedAssignmentVersion === null ||
    expectedAssignmentVersion < 1 ||
    expectedConfigVersion === null ||
    expectedConfigVersion < 0
  ) {
    return {
      ok: false,
      error: "Refresh the runner before sending a command.",
    };
  }
  if (commandType === "EMERGENCY_STOP" && (!reason || reason.length < 3)) {
    return {
      ok: false,
      error: "Emergency stop requires a short reason.",
    };
  }
  if (idempotencyKey && !UUID_PATTERN.test(idempotencyKey)) {
    return { ok: false, error: "The command request ID is invalid." };
  }

  return {
    ok: true,
    value: {
      companySlug,
      runnerId,
      assignmentId,
      commandType: commandType as RunnerControlCommand,
      expectedAssignmentVersion,
      expectedConfigVersion,
      reason,
      idempotencyKey,
    },
  };
}

export function runnerCommandLabel(command: RunnerControlCommand) {
  if (command === "DRAIN_STOP") return "Drain and stop";
  if (command === "EMERGENCY_STOP") return "Emergency stop";
  if (command === "RESUME") return "Resume";
  return "Pause";
}

export function runnerCommandIsPending(state: string | null | undefined) {
  return ["REQUESTED", "DELIVERED", "ACKNOWLEDGED"].includes(
    String(state ?? "").toUpperCase()
  );
}
