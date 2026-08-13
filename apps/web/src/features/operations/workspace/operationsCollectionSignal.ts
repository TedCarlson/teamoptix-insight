export type OperationsCollectionRequestSignalRow = {
  id: string;
  request_type: string;
  request_status: string;
  error_message: string | null;
  claimed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type OperationsRunnerSignalSchedule = {
  collection_enabled: boolean;
  operations_pulse_enabled: boolean;
  operations_pulse_start_time: string;
  operations_pulse_end_time: string;
  runner_state: string;
  runner_last_seen_at?: string | null;
  runner_last_error?: string | null;
};

export type OperationsSignalCalendar = {
  operating_weekdays?: number[];
  operating_date_overrides?: Record<string, "OPERATING" | "CLOSED">;
};

export type OperationsSignalTone =
  | "active"
  | "waiting"
  | "critical"
  | "neutral";

export type OperationsStatusSignal = {
  key: "collection" | "activity" | "ingestion";
  label: string;
  value: string;
  detail: string;
  tone: OperationsSignalTone;
};

export type OperationsCollectionSignal = {
  active: boolean;
  collectionObservedAt: string | null;
  ingestionSucceededAt: string | null;
  collection: OperationsStatusSignal;
  activity: OperationsStatusSignal;
  ingestion: OperationsStatusSignal;
};

const ACTIVE_STATUSES = new Set([
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
]);

export function easternClockParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function updateTime(value: string | null) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

/**
 * Three authorities are deliberately kept separate:
 * - the signed master gate says whether collection is ON or OFF;
 * - runner/request evidence says what collection is doing;
 * - the ingestion pipeline says whether a file was accepted.
 *
 * Legacy pulse windows and operating calendars must never rewrite the master
 * gate's state. They remain transport/scheduling compatibility fields only.
 */
export function deriveOperationsCollectionSignal(params: {
  now: Date;
  operationalDate?: string | null;
  latestIngestionSuccessAt?: string | null;
  requests: OperationsCollectionRequestSignalRow[];
  runnerSchedule?: OperationsRunnerSignalSchedule | null;
  operatingCalendar?: OperationsSignalCalendar | null;
}): OperationsCollectionSignal {
  const { now, requests, runnerSchedule = null } = params;
  const collectionObservedAt = runnerSchedule?.runner_last_seen_at ?? null;
  const ingestionSucceededAt = params.latestIngestionSuccessAt ?? null;
  const collectionEnabled = runnerSchedule?.collection_enabled === true;

  const collection: OperationsStatusSignal = {
    key: "collection",
    label: "Collection",
    value: runnerSchedule ? (collectionEnabled ? "ON" : "OFF") : "UNKNOWN",
    detail: runnerSchedule
      ? collectionEnabled
        ? "Master gate enabled"
        : "Master gate disabled"
      : "Master gate unavailable",
    tone: runnerSchedule
      ? collectionEnabled
        ? "active"
        : "waiting"
      : "neutral",
  };

  const activeCollection = requests.find(
    (request) =>
      request.claimed_by !== null && ACTIVE_STATUSES.has(request.request_status)
  );
  const heartbeatAge = collectionObservedAt
    ? now.getTime() - new Date(collectionObservedAt).getTime()
    : Number.POSITIVE_INFINITY;
  const heartbeatDetail = collectionObservedAt
    ? `Check-in ${updateTime(collectionObservedAt)}`
    : "Check-in unavailable";

  let activity: OperationsStatusSignal;
  if (runnerSchedule?.runner_state === "ERROR") {
    activity = {
      key: "activity",
      label: "Collection activity",
      value: "ATTENTION",
      detail:
        runnerSchedule.runner_last_error?.trim() ||
        `Runner error · ${heartbeatDetail}`,
      tone: "critical",
    };
  } else if (
    runnerSchedule?.runner_state === "RUNNING" ||
    Boolean(activeCollection)
  ) {
    activity = {
      key: "activity",
      label: "Collection activity",
      value: "COLLECTING",
      detail: heartbeatDetail,
      tone: "active",
    };
  } else if (!collectionObservedAt || heartbeatAge > 45 * 60_000) {
    activity = {
      key: "activity",
      label: "Collection activity",
      value: "ATTENTION",
      detail: collectionObservedAt
        ? `Check-in stale · ${updateTime(collectionObservedAt)}`
        : "Check-in unavailable",
      tone: "critical",
    };
  } else {
    activity = {
      key: "activity",
      label: "Collection activity",
      value: collectionEnabled ? "READY" : "IDLE",
      detail: heartbeatDetail,
      tone: collectionEnabled ? "active" : "neutral",
    };
  }

  const ingestion: OperationsStatusSignal = ingestionSucceededAt
    ? {
        key: "ingestion",
        label: "Ingestion",
        value: "SUCCEEDED",
        detail: `Last receipt ${updateTime(ingestionSucceededAt)}`,
        tone: "active",
      }
    : {
        key: "ingestion",
        label: "Ingestion",
        value: "AWAITING RECEIPT",
        detail: "No successful receipt recorded",
        tone: "neutral",
      };

  return {
    active: collectionEnabled,
    collectionObservedAt,
    ingestionSucceededAt,
    collection,
    activity,
    ingestion,
  };
}
