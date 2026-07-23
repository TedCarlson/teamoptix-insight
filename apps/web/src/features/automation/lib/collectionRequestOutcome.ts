export type CollectionRequestOutcome = {
  request_status?: string | null;
  error_message?: string | null;
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
