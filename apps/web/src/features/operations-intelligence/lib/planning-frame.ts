export type PlanningFrame =
  | "AM_READINESS"
  | "ACTIVE_SERVICE"
  | "AWAITING_PM_PLAN"
  | "PM_PLANNING"
  | "NON_OPERATIONAL";


export type DroCandidate = {
  date: string;
  frame: "AM" | "PM";
  mode: "READINESS" | "PLANNING" | "BASELINE";
};

export function getDroCandidateOrder(params: {
  todayDate: string;
  planningDate: string;
}): DroCandidate[] {
  return [
    { date: params.todayDate, frame: "AM", mode: "READINESS" },
    { date: params.todayDate, frame: "PM", mode: "READINESS" },
    { date: params.planningDate, frame: "PM", mode: "PLANNING" },
  ];
}

export type PlanningFrameResolution = {
  frame: PlanningFrame;
  operationalDate: string;
  planningSessionDate: string | null;
  planningSessionFrame: "AM" | "PM" | null;
  reason: string;
};

export type DswCurrentRow = {
  planned_delivery_stops?: number | string | null;
  actual_delivery_stops?: number | string | null;
  vscan_packages?: number | string | null;
  actual_delivery_packages?: number | string | null;
};

export type DswCurrentPayload = {
  source?: "DSW" | string | null;
  generated_at_text?: string | null;
  rows?: DswCurrentRow[];
};

const SERVICE_COMPLETE_THRESHOLD = 85;
const NO_SERVICE_FALLBACK_HOUR = 10;

export function currentNyHour() {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

export function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatOperationalDate(dateIso: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedPct(actual: number, planned: number) {
  if (planned <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((actual / planned) * 100)));
}

function rowCompletionPct(row: DswCurrentRow) {
  const plannedStops = safeNumber(row.planned_delivery_stops);
  const actualStops = safeNumber(row.actual_delivery_stops);
  const plannedPackages = safeNumber(row.vscan_packages);
  const actualPackages = safeNumber(row.actual_delivery_packages);

  if (plannedStops > 0) return boundedPct(actualStops, plannedStops);
  if (plannedPackages > 0) return boundedPct(actualPackages, plannedPackages);

  return null;
}

export function summarizeServiceCompletion(rows: DswCurrentRow[]) {
  const values = rows
    .map(rowCompletionPct)
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function resolvePlanningFrame(params: {
  todayDate: string;
  planningDate: string;
  activeDroDate?: string | null;
  activeDroFrame?: string | null;
  serviceCompletionPct: number | null;
  localHour?: number;
}): PlanningFrameResolution {
  const localHour = params.localHour ?? currentNyHour();
  const activeDroFrame = String(params.activeDroFrame ?? "").toUpperCase();

  if (params.activeDroDate === params.planningDate && activeDroFrame === "PM") {
    return {
      frame: "PM_PLANNING",
      operationalDate: params.planningDate,
      planningSessionDate: params.todayDate,
      planningSessionFrame: "PM",
      reason: "PM planning upload is available for the next operational date.",
    };
  }

  if (params.serviceCompletionPct !== null && params.serviceCompletionPct >= SERVICE_COMPLETE_THRESHOLD) {
    return {
      frame: "AWAITING_PM_PLAN",
      operationalDate: params.planningDate,
      planningSessionDate: params.todayDate,
      planningSessionFrame: "PM",
      reason: "Current service has crossed the completion threshold.",
    };
  }

  if (params.activeDroDate === params.todayDate && activeDroFrame === "AM" && params.serviceCompletionPct !== null) {
    return {
      frame: "ACTIVE_SERVICE",
      operationalDate: params.todayDate,
      planningSessionDate: addDaysIso(params.todayDate, -1),
      planningSessionFrame: "PM",
      reason: "AM DRO and current service signals are available.",
    };
  }

  if (params.serviceCompletionPct === null && localHour >= NO_SERVICE_FALLBACK_HOUR) {
    return {
      frame: "NON_OPERATIONAL",
      operationalDate: params.planningDate,
      planningSessionDate: params.todayDate,
      planningSessionFrame: "PM",
      reason: "No current service signal exists after the fallback hour.",
    };
  }

  return {
    frame: "AM_READINESS",
    operationalDate: params.todayDate,
    planningSessionDate: addDaysIso(params.todayDate, -1),
    planningSessionFrame: "PM",
    reason: "Yesterday PM plan remains active for today's readiness frame.",
  };
}

export function planningFrameLabel(frame: PlanningFrame) {
  switch (frame) {
    case "ACTIVE_SERVICE":
      return "Active Service";
    case "AWAITING_PM_PLAN":
      return "Awaiting PM Plan";
    case "PM_PLANNING":
      return "PM Planning";
    case "NON_OPERATIONAL":
      return "Non-Operational";
    case "AM_READINESS":
    default:
      return "AM Readiness";
  }
}

export function planningFramePrimaryNarrative(params: {
  frame: PlanningFrame;
  heavyRoutes: number;
  limitedHistoryRoutes: number;
}) {
  if (params.frame === "AWAITING_PM_PLAN") {
    return "Today's service has advanced far enough to await the next PM planning upload.";
  }

  if (params.frame === "NON_OPERATIONAL") {
    return "No active service signal has appeared for today.";
  }

  const day = params.frame === "PM_PLANNING" ? "Tomorrow" : "Today's operation";

  if (params.heavyRoutes > 0) return `${day} looks manageable, with localized workload pressure.`;
  if (params.limitedHistoryRoutes > 0) return `${day} looks manageable, with a few routes still building history.`;

  return params.frame === "PM_PLANNING"
    ? "Tomorrow is shaping up as a normal operating day."
    : "Today's operation is shaping up as a normal operating day.";
}

export function planningFrameSecondaryNarrative(params: {
  frame: PlanningFrame;
  heavyRoutes: number;
  limitedHistoryRoutes: number;
}) {
  if (params.frame === "AWAITING_PM_PLAN") {
    return "Insight has advanced the planning frame and is waiting for today's PM plan for tomorrow's operation.";
  }

  if (params.frame === "NON_OPERATIONAL") {
    return "This may be a non-operational day, holiday, weather exception, or a day with no uploaded service activity yet.";
  }

  if (params.heavyRoutes > 0) {
    return params.frame === "PM_PLANNING"
      ? "Several routes are trending above historical workload. Driver assignment should stay in focus before dispatch."
      : "Several routes are above today's historical workload range. Driver assignment should stay in focus before dispatch.";
  }

  if (params.limitedHistoryRoutes > 0) {
    return "Most routes align with history. A few routes need more operating history before Insight can compare with confidence.";
  }

  return "The imported plan aligns with recent route history. Continue monitoring assignment coverage before dispatch.";
}
