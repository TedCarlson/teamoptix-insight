import { resolveOperatingDateDecision } from "./operationsOperatingCalendar";

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

export type OperationsCollectionSignal = {
  active: boolean;
  copy: string;
  collectionObservedAt: string | null;
  ingestionSucceededAt: string | null;
  tone: "active" | "waiting" | "critical";
};

const ACTIVE_STATUSES = new Set([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
]);

const DAILY_PACKAGE_TYPES = new Set([
  "PREVIOUS_DAY_CLOSE",
  "DRO_AM",
  "OPERATIONS_PULSE",
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

function clockMinutes(value: string | null | undefined) {
  const [hour, minute] = String(value ?? "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return hour * 60 + minute;
}

function formatScheduleClock(value: string | null | undefined) {
  const [hour, minute] = String(value ?? "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function updateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function authorityCopy(params: {
  collection: string;
  collectionObservedAt: string | null;
  ingestionSucceededAt: string | null;
}) {
  const collectionTime = params.collectionObservedAt
    ? `collection check-in ${updateTime(params.collectionObservedAt)}`
    : "collection check-in unavailable";
  const ingestionTime = params.ingestionSucceededAt
    ? `ingestion succeeded ${updateTime(params.ingestionSucceededAt)}`
    : "ingestion success unavailable";

  return `${params.collection} · ${collectionTime} · ${ingestionTime}`;
}

export function deriveOperationsCollectionSignal(params: {
  now: Date;
  operationalDate?: string | null;
  latestIngestionSuccessAt?: string | null;
  requests: OperationsCollectionRequestSignalRow[];
  runnerSchedule?: OperationsRunnerSignalSchedule | null;
  operatingCalendar?: OperationsSignalCalendar | null;
}): OperationsCollectionSignal {
  const {
    now,
    requests,
    runnerSchedule = null,
    operatingCalendar = null,
  } = params;
  const collectionObservedAt = runnerSchedule?.runner_last_seen_at ?? null;
  const ingestionSucceededAt = params.latestIngestionSuccessAt ?? null;
  const signal = (
    active: boolean,
    tone: OperationsCollectionSignal["tone"],
    collection: string
  ): OperationsCollectionSignal => ({
    active,
    tone,
    collectionObservedAt,
    ingestionSucceededAt,
    copy: authorityCopy({
      collection,
      collectionObservedAt,
      ingestionSucceededAt,
    }),
  });
  const eastern = easternClockParts(now);
  const operationalDate = params.operationalDate ?? eastern.date;
  const dayOfWeek = new Date(`${operationalDate}T00:00:00Z`).getUTCDay();
  const operatingDateDecision = resolveOperatingDateDecision({
    operationalDate,
    dayOfWeek,
    operatingWeekdays: operatingCalendar?.operating_weekdays,
    operatingDateOverrides: operatingCalendar?.operating_date_overrides,
  });
  const visibleRequests = requests.filter(
    (request) =>
      !(
        runnerSchedule &&
        request.claimed_by === null &&
        DAILY_PACKAGE_TYPES.has(request.request_type)
      )
  );
  const latestSuccessfulCollection = visibleRequests.find(
    (request) => request.request_status === "COMPLETE"
  );
  const activeCollection = visibleRequests.find((request) =>
    ACTIVE_STATUSES.has(request.request_status)
  );
  const latestCollection = visibleRequests[0];
  const withinWindow = Boolean(
    runnerSchedule &&
      eastern.minutes >= clockMinutes(runnerSchedule.operations_pulse_start_time) &&
      eastern.minutes < clockMinutes(runnerSchedule.operations_pulse_end_time)
  );
  const active =
    Boolean(activeCollection) ||
    Boolean(
      runnerSchedule?.collection_enabled &&
        runnerSchedule.operations_pulse_enabled &&
        operatingDateDecision.operates &&
        withinWindow
    );

  if (runnerSchedule?.runner_state === "ERROR") {
    return signal(
      false,
      "critical",
      runnerSchedule.runner_last_error?.trim()
        ? `Collection failed · ${runnerSchedule.runner_last_error.trim()}`
        : "Collection failed · runner requires attention"
    );
  }

  if (
    runnerSchedule?.collection_enabled &&
    runnerSchedule.operations_pulse_enabled &&
    operatingDateDecision.operates &&
    withinWindow &&
    (!runnerSchedule.runner_last_seen_at ||
      now.getTime() - new Date(runnerSchedule.runner_last_seen_at).getTime() >
        45 * 60_000)
  ) {
    return signal(
      false,
      "critical",
      "Collection failed · runner heartbeat is more than 45 minutes old"
    );
  }

  if (!active) {
    if (!operatingDateDecision.operates) {
      return signal(
        false,
        "waiting",
          operatingDateDecision.override === "CLOSED"
            ? "Collection paused · dated closure"
            : "Collection paused · outside the operating calendar"
      );
    }
    return signal(
      false,
      "waiting",
      runnerSchedule?.operations_pulse_start_time
        ? `Collection paused · next pulse begins ${formatScheduleClock(
            runnerSchedule.operations_pulse_start_time
          )}`
        : "Collection paused"
    );
  }

  if (runnerSchedule?.runner_state === "RUNNING") {
    return signal(true, "active", "Collection Active · runner cycle in progress");
  }

  const activeStartedAt = activeCollection?.started_at
    ? new Date(activeCollection.started_at).getTime()
    : Number.NaN;
  if (Number.isFinite(activeStartedAt)) {
    const elapsedMinutes = Math.max(
      0,
      Math.floor((now.getTime() - activeStartedAt) / 60_000)
    );
    const progress =
      activeCollection?.request_status === "ARTIFACTS_READY" ||
      activeCollection?.request_status === "INGESTING"
        ? "processing collected files"
        : `collection running · ${elapsedMinutes} min elapsed`;
    return signal(true, "active", `Collection Active · ${progress}`);
  }

  if (
    latestCollection?.request_status === "FAILED" ||
    latestCollection?.request_status === "CANCELLED"
  ) {
    return signal(
      true,
      "active",
      `Collection recovery active · last attempt ${updateTime(
        latestCollection.updated_at
      )}`
    );
  }

  return signal(
    true,
    "active",
    latestSuccessfulCollection?.completed_at
      ? "Collection Active · next cycle starts on success"
      : "Collection Active · runner released for continuous collection"
  );
}
