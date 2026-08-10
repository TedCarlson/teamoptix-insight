import type {
  BatchAcknowledgment,
  BreadcrumbBatchPayload,
  PendingBatch,
} from "./types";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function canAttemptNetworkSync(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}) {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function parseBatchAcknowledgment(
  value: unknown,
  expectedBatchId: string,
): BatchAcknowledgment {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The server returned an invalid batch acknowledgment.");
  }

  const record = value as Record<string, unknown>;
  const rejected = record.rejected;
  const validRejected =
    Array.isArray(rejected) &&
    rejected.every(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (typeof (item as Record<string, unknown>).point_id === "string" ||
          (item as Record<string, unknown>).point_id === null) &&
        typeof (item as Record<string, unknown>).code === "string" &&
        typeof (item as Record<string, unknown>).retryable === "boolean",
    );

  if (
    record.ok !== true ||
    record.batch_id !== expectedBatchId ||
    !["ACKNOWLEDGED", "PARTIAL", "REJECTED"].includes(
      String(record.batch_status),
    ) ||
    typeof record.duplicate_batch !== "boolean" ||
    !isStringArray(record.accepted_point_ids) ||
    !isStringArray(record.duplicate_point_ids) ||
    !validRejected ||
    typeof record.server_received_at !== "string"
  ) {
    throw new Error("The server returned an invalid batch acknowledgment.");
  }

  return record as unknown as BatchAcknowledgment;
}

export function pointDisposition(
  acknowledgment: BatchAcknowledgment,
  pointId: string,
): "ACKNOWLEDGED" | "REJECTED" | "PENDING" {
  if (
    acknowledgment.accepted_point_ids.includes(pointId) ||
    acknowledgment.duplicate_point_ids.includes(pointId)
  ) {
    return "ACKNOWLEDGED";
  }
  if (acknowledgment.rejected.some((item) => item.point_id === pointId)) {
    return "REJECTED";
  }
  return "PENDING";
}

export function retryDelayMs(attemptCount: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attemptCount, 6));
}

export function assertTenantBatch(
  tenantKey: string,
  storedTenantKey: string,
  payload: BreadcrumbBatchPayload,
) {
  if (tenantKey !== storedTenantKey) {
    throw new Error(`Tenant isolation violation for batch ${payload.batch_id}.`);
  }
}

export function assertPointWithinDutyWindow(
  pointCapturedAt: string,
  sessionStartedAt: string,
  sessionEndedAt: string | null,
  nowMs = Date.now(),
) {
  const pointMs = new Date(pointCapturedAt).getTime();
  const startedMs = new Date(sessionStartedAt).getTime();
  const endedMs = sessionEndedAt ? new Date(sessionEndedAt).getTime() : null;

  if (!Number.isFinite(pointMs) || !Number.isFinite(startedMs)) {
    throw new Error("The location fix has an invalid device timestamp.");
  }
  if (pointMs < startedMs) {
    throw new Error(
      "The location fix predates this duty session. Capture the point again.",
    );
  }
  if (endedMs != null && pointMs > endedMs) {
    throw new Error("The location fix occurred after this duty session ended.");
  }
  if (pointMs > nowMs + 15 * 60 * 1000) {
    throw new Error("The location fix is too far in the future.");
  }
}

export type PersistedBatchRecord = {
  batch_id: string;
  session_id: string;
  tenant_key: string;
  payload_json: string;
  attempt_count: number;
  next_attempt_at: string;
};

export function recoverPendingBatch(record: PersistedBatchRecord): PendingBatch {
  const payload = JSON.parse(record.payload_json) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Stored batch ${record.batch_id} has an invalid payload.`);
  }
  const typed = payload as Partial<BreadcrumbBatchPayload>;
  if (typed.batch_id !== record.batch_id || !Array.isArray(typed.points)) {
    throw new Error(`Stored batch ${record.batch_id} failed identity validation.`);
  }

  return {
    batchId: record.batch_id,
    sessionId: record.session_id,
    tenantKey: record.tenant_key,
    payload: typed as BreadcrumbBatchPayload,
    attemptCount: record.attempt_count,
    nextAttemptAt: record.next_attempt_at,
  };
}
