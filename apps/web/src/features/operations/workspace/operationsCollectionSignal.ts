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
};

export type OperationsSignalCalendar = {
  operating_weekdays?: number[];
  operating_date_overrides?: Record<string, "OPERATING" | "CLOSED">;
};

export type OperationsCollectionSignal = {
  active: boolean;
  copy: string;
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

export function deriveOperationsCollectionSignal(params: {
  now: Date;
  operationalDate?: string | null;
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
    (request) =>
      request.request_status === "COMPLETE" && !request.error_message
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

  if (!active) {
    if (!operatingDateDecision.operates) {
      return {
        active: false,
        copy:
          operatingDateDecision.override === "CLOSED"
            ? "Collection paused · dated closure"
            : "Collection paused · outside the operating calendar",
      };
    }
    return {
      active: false,
      copy: runnerSchedule?.operations_pulse_start_time
        ? `Collection paused · next pulse begins ${formatScheduleClock(
            runnerSchedule.operations_pulse_start_time
          )}`
        : "Collection paused",
    };
  }

  if (runnerSchedule?.runner_state === "RUNNING") {
    return { active: true, copy: "Collection Active · runner cycle in progress" };
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
    return { active: true, copy: `Collection Active · ${progress}` };
  }

  if (
    latestCollection?.request_status === "FAILED" ||
    latestCollection?.request_status === "CANCELLED"
  ) {
    return {
      active: true,
      copy: `Collection recovery active · last attempt ${updateTime(
        latestCollection.updated_at
      )}`,
    };
  }

  return {
    active: true,
    copy: latestSuccessfulCollection?.completed_at
      ? `Collection Active · next cycle starts on success · last update ${updateTime(
          latestSuccessfulCollection.completed_at
        )}`
      : "Collection Active · runner released for continuous collection",
  };
}
