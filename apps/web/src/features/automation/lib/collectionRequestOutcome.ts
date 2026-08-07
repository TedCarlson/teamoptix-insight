export type CollectionRequestOutcome = {
  request_status?: string | null;
  error_message?: string | null;
};

export type CollectionRequestAttention = CollectionRequestOutcome & {
  company_id?: string | null;
  company_slug?: string | null;
  request_type?: string | null;
  created_at?: string | null;
};

export type AutomationRunAttention = {
  company_id?: string | null;
  company_slug?: string | null;
  automation_type?: string | null;
  status?: string | null;
  started_at?: string | null;
};

export const ACTIVE_COLLECTION_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
] as const;

export function isActiveCollectionRequest(request: CollectionRequestOutcome) {
  return ACTIVE_COLLECTION_STATUSES.includes(
    String(request.request_status ?? "").toUpperCase() as (typeof ACTIVE_COLLECTION_STATUSES)[number]
  );
}

export function isCleanCompleteCollectionRequest(request: CollectionRequestOutcome) {
  return String(request.request_status ?? "").toUpperCase() === "COMPLETE" &&
    !String(request.error_message ?? "").trim();
}

export function isCollectionRequestException(request: CollectionRequestOutcome) {
  const status = String(request.request_status ?? "").toUpperCase();
  return status === "FAILED" || (status === "COMPLETE" && Boolean(String(request.error_message ?? "").trim()));
}

function newestFirst<T>(rows: T[], timestamp: (row: T) => string | null | undefined) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(String(timestamp(left) ?? "")).getTime();
    const rightTime = new Date(String(timestamp(right) ?? "")).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function attentionKey(companyId: unknown, companySlug: unknown, type: unknown) {
  return `${String(companyId || companySlug || "unknown").trim().toLowerCase()}:${String(type || "unknown").trim().toUpperCase()}`;
}

export function currentCollectionRequestExceptions<T extends CollectionRequestAttention>(requests: T[]) {
  const closed = new Set<string>();
  const open = new Set<string>();
  const attention: T[] = [];

  for (const request of newestFirst(requests, (row) => row.created_at)) {
    const key = attentionKey(request.company_id, request.company_slug, request.request_type);
    if (closed.has(key) || open.has(key)) continue;
    if (isCleanCompleteCollectionRequest(request)) {
      closed.add(key);
    } else if (isCollectionRequestException(request)) {
      open.add(key);
      attention.push(request);
    }
  }

  return attention;
}

export function currentAutomationRunFailures<T extends AutomationRunAttention>(runs: T[]) {
  const closed = new Set<string>();
  const open = new Set<string>();
  const attention: T[] = [];

  for (const run of newestFirst(runs, (row) => row.started_at)) {
    const key = attentionKey(run.company_id, run.company_slug, run.automation_type);
    if (closed.has(key) || open.has(key)) continue;
    const status = String(run.status ?? "").toUpperCase();
    if (["COMPLETE", "SUCCESS", "SUCCEEDED"].includes(status)) {
      closed.add(key);
    } else if (status === "FAILED") {
      open.add(key);
      attention.push(run);
    }
  }

  return attention;
}
