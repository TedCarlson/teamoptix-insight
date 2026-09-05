import {
  buildAssignmentMapFromRoutesAndEvents,
} from "@/features/dispatch/lib/dispatchEventReducer";
import {
  buildHydratedRoutes,
  createRouteSorter,
  type RouteSortKey,
} from "@/features/dispatch/lib/dispatchSelectors";
import {
  getReversedDispatchEventIds,
  type DispatchEventRow,
  type DispatchRoute,
  type GeneratedScheduleRow,
  type RouteRow,
} from "@/features/dispatch/lib/dispatchSupport";
import type { ScheduleCapacityRoute } from "@/features/schedule/lib/scheduleCapacity";

export const OPERATIONS_WEEKDAYS = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

export type OperatingContext = "BAU" | "PEAK" | "HOLIDAY";
export type BlackoutSelectionMode = "INDIVIDUAL" | "RANGE";

export type BlackoutSelection = {
  dates: string[];
  rangeAnchor: string | null;
};

export function scheduledWorkforceCount(rows: GeneratedScheduleRow[]) {
  return new Set(
    rows
      .filter((row) => row.planned_on)
      .map((row) => row.roster_member_id)
  ).size;
}

export function projectHolidayWorkforce<T extends GeneratedScheduleRow>(
  rows: T[]
): T[] {
  return rows.map((row) =>
    row.planned_on
      ? {
          ...row,
          planned_on: false,
          route_name: null,
          source_kind: "OVERRIDE",
          override_type: "HOLIDAY",
        }
      : row
  );
}

export function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addCalendarDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isoDatesBetweenInclusive(startDate: string, endDate: string) {
  const [first, last] = startDate <= endDate
    ? [startDate, endDate]
    : [endDate, startDate];
  const dates: string[] = [];
  let current = dateFromIso(first);
  const end = dateFromIso(last);

  while (current <= end) {
    dates.push(isoDate(current));
    current = addCalendarDays(current, 1);
  }

  return dates;
}

export function updateBlackoutSelection(params: {
  dates: string[];
  clickedDate: string;
  mode: BlackoutSelectionMode;
  rangeAnchor: string | null;
}): BlackoutSelection {
  if (params.mode === "INDIVIDUAL") {
    const selected = new Set(params.dates);
    if (selected.has(params.clickedDate)) selected.delete(params.clickedDate);
    else selected.add(params.clickedDate);
    return { dates: [...selected].sort(), rangeAnchor: null };
  }

  if (!params.rangeAnchor) {
    return { dates: [params.clickedDate], rangeAnchor: params.clickedDate };
  }

  return {
    dates: isoDatesBetweenInclusive(params.rangeAnchor, params.clickedDate),
    rangeAnchor: null,
  };
}

export function startOfOperationsWeek(date: Date) {
  const copy = new Date(date);
  const offset = (copy.getDay() + 1) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

export function operationsMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = startOfOperationsWeek(first);
  return Array.from({ length: 42 }, (_, index) =>
    addCalendarDays(start, index)
  );
}

export function activeDispatchEvents(events: DispatchEventRow[]) {
  const reversedIds = getReversedDispatchEventIds(events);
  return events.filter(
    (event) =>
      !reversedIds.has(event.id) && !event.event_code.startsWith("UNDO_")
  );
}

export function operatingContextForEvents(
  events: DispatchEventRow[]
): OperatingContext {
  const contextEvents = activeDispatchEvents(events)
    .filter((event) =>
      ["OPERATIONS_CLOSED", "OPERATIONS_PEAK"].includes(event.event_code)
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const latest = contextEvents.at(-1);
  if (latest?.event_code === "OPERATIONS_CLOSED") return "HOLIDAY";
  if (latest?.event_code === "OPERATIONS_PEAK") return "PEAK";
  return "BAU";
}

export function activeOperatingContextEvents(events: DispatchEventRow[]) {
  return activeDispatchEvents(events).filter((event) =>
    ["OPERATIONS_CLOSED", "OPERATIONS_PEAK"].includes(event.event_code)
  );
}

export function resolveOperationsLineup(params: {
  routes: RouteRow[];
  scheduleRows: GeneratedScheduleRow[];
  serviceDate: string;
  events: DispatchEventRow[];
  routeSortKey?: RouteSortKey;
  includeOperatingContext?: boolean;
}) {
  const routeSort = createRouteSorter(params.routeSortKey ?? "route_name");
  const hydrated = buildHydratedRoutes({
    routes: params.routes,
    scheduleRows: params.scheduleRows,
    serviceDate: params.serviceDate,
    routeSort,
  });
  const includeClosedEvent =
    params.includeOperatingContext !== false &&
    operatingContextForEvents(params.events) === "HOLIDAY";
  const events = includeClosedEvent
    ? params.events
    : params.events.filter(
        (event) => event.event_code !== "OPERATIONS_CLOSED"
      );

  return Object.values(
    buildAssignmentMapFromRoutesAndEvents(hydrated, events)
  ).sort(routeSort);
}

export function capacityRoutesFromLineup(
  routes: DispatchRoute[]
): ScheduleCapacityRoute[] {
  return routes.map((route) => ({
    id: route.route_key,
    route_name: route.route_name,
    current_wa_num: route.current_wa_num,
    runs_s: true,
    runs_u: true,
    runs_m: true,
    runs_t: true,
    runs_w: true,
    runs_h: true,
    runs_f: true,
  }));
}

export function dateLabel(value: string, includeYear = false) {
  return dateFromIso(value).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}
