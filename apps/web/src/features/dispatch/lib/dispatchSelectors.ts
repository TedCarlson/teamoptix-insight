import { type DroPlanRow } from "./droPlanSignals";
import { dispatchPersonFromEvent } from "./dispatchEventReducer";
import {
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRosterRow,
  type DispatchRoute,
  type GeneratedScheduleRow,
  type RouteRow,
  classifyPerson,
  cleanRouteKey,
  getReversedDispatchEventIds,
  personFromRow,
  personSort,
  personTypeLabel,
  runFlagForDate,
} from "./dispatchSupport";

export type RouteSortKey = "route_name" | "current_wa_num";

export function createRouteSorter(routeSortKey: RouteSortKey) {
  return (a: DispatchRoute, b: DispatchRoute) => {
    const valueA =
      routeSortKey === "current_wa_num"
        ? a.current_wa_num || a.route_name || a.route_key
        : a.route_name || a.current_wa_num || a.route_key;

    const valueB =
      routeSortKey === "current_wa_num"
        ? b.current_wa_num || b.route_name || b.route_key
        : b.route_name || b.current_wa_num || b.route_key;

    return valueA.localeCompare(valueB, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  };
}

export function orderedRouteLabel(route: DispatchRoute, routeSortKey: RouteSortKey) {
  const routeName = route.route_name?.trim() ?? "";
  const workArea = route.current_wa_num?.trim() ?? "";

  if (routeSortKey === "current_wa_num") {
    return [workArea, routeName].filter(Boolean).join(" · ") || route.route_key;
  }

  return [routeName, workArea].filter(Boolean).join(" · ") || route.route_key;
}

export function buildArrivedPersonIds(dispatchEvents: DispatchEventRow[]) {
  const latest = new Map<string, boolean>();

  const orderedEvents = [...dispatchEvents].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  for (const event of orderedEvents) {
    const personId = event.person_roster_member_id;
    if (!personId) continue;

    if (event.event_code === "ARRIVED") latest.set(personId, true);
    if (event.event_code === "UNDO_ARRIVED") latest.set(personId, false);
  }

  return new Set(
    [...latest.entries()]
      .filter(([, arrived]) => arrived)
      .map(([personId]) => personId)
  );
}

export function buildDroPlanByWa(droPlanRows: DroPlanRow[]) {
  const map = new Map<string, DroPlanRow>();

  for (const row of droPlanRows) {
    if (row.wa_number) map.set(row.wa_number, row);
    if (row.route_name) map.set(row.route_name.toLowerCase(), row);
  }

  return map;
}

export function buildHydratedRoutes(params: {
  routes: RouteRow[];
  scheduleRows: GeneratedScheduleRow[];
  serviceDate: string;
  routeSort: (a: DispatchRoute, b: DispatchRoute) => number;
}) {
  const { routes, scheduleRows, serviceDate, routeSort } = params;
  const runFlag = runFlagForDate(serviceDate);
  const routeMap = new Map<string, DispatchRoute>();

  for (const route of routes) {
    if (!route[runFlag as keyof RouteRow]) continue;

    const key = cleanRouteKey(route.current_wa_num || route.route_name);

    routeMap.set(key, {
      route_key: key,
      route_name: route.route_name?.trim() || key,
      current_wa_num: route.current_wa_num,
      route_location: route.route_location,
      route_type: route.route_type,
      driver: null,
      helpers: [],
      trainees: [],
      extras: [],
    });
  }

  for (const row of scheduleRows) {
    if (row.service_date !== serviceDate || !row.planned_on) continue;

    const rawRouteName = row.route_name?.trim();
    if (!rawRouteName) continue;

    const key = cleanRouteKey(rawRouteName);

    const route = routeMap.get(key);
    if (!route) continue;

    const person = personFromRow(row);
    const seat = classifyPerson(row);

    if (seat === "helper") {
      route.helpers.push(person);
    } else if (seat === "trainee") {
      route.trainees.push(person);
    } else if (!route.driver) {
      route.driver = person;
    } else {
      route.extras.push(person);
    }
  }

  return Array.from(routeMap.values()).sort(routeSort);
}

export function buildScheduledRosterIds(
  scheduleRows: GeneratedScheduleRow[],
  serviceDate: string
) {
  const ids = new Set<string>();

  for (const row of scheduleRows) {
    if (row.service_date !== serviceDate) continue;
    ids.add(row.roster_member_id);
  }

  return ids;
}

export function buildAllPeople(params: {
  scheduleRows: GeneratedScheduleRow[];
  dispatchEvents: DispatchEventRow[];
  serviceDate: string;
}) {
  const { scheduleRows, dispatchEvents, serviceDate } = params;
  const byId = new Map<string, DispatchPerson>();

  for (const row of scheduleRows) {
    if (row.service_date !== serviceDate || !row.planned_on) continue;
    const person = personFromRow(row);
    byId.set(person.roster_member_id, person);
  }

  const reversedEventIds = getReversedDispatchEventIds(dispatchEvents);

  for (const event of dispatchEvents) {
    if (reversedEventIds.has(event.id)) continue;
    if (event.event_code.startsWith("UNDO_")) continue;
    if (event.event_code !== "ADD_DRIVER") continue;

    const person = dispatchPersonFromEvent(event);
    if (!person) continue;
    byId.set(person.roster_member_id, {
      ...person,
      source_kind: "DISPATCH_ADD_DRIVER",
    });
  }

  return Array.from(byId.values()).sort(personSort);
}

export function buildCallouts(params: {
  scheduleRows: GeneratedScheduleRow[];
  dispatchEvents: DispatchEventRow[];
  serviceDate: string;
}) {
  const { scheduleRows, dispatchEvents, serviceDate } = params;
  const byId = new Map<string, DispatchPerson>();

  for (const row of scheduleRows) {
    if (row.service_date !== serviceDate) continue;
    if (row.override_type !== "CALL_OUT") continue;

    const person = personFromRow(row);
    byId.set(person.roster_member_id, person);
  }

  const reversedEventIds = getReversedDispatchEventIds(dispatchEvents);

  for (const event of dispatchEvents) {
    if (reversedEventIds.has(event.id)) continue;
    if (event.event_code.startsWith("UNDO_")) continue;
    if (event.event_code !== "CALL_OUT" && event.event_code !== "NO_SHOW") continue;

    const person = dispatchPersonFromEvent(event);
    if (!person) continue;

    byId.set(person.roster_member_id, {
      ...person,
      source_kind: "DISPATCH_EVENT",
      override_type: event.event_code,
    });
  }

  return Array.from(byId.values()).sort(personSort);
}

export function buildAssignedIds(
  dispatchRoutes: DispatchRoute[],
  hydratedRoutes: DispatchRoute[]
) {
  const ids = new Set<string>();

  const visibleRouteKeys = new Set(
    hydratedRoutes
      .filter((route) => route.route_key !== "UNASSIGNED")
      .map((route) => route.route_key)
  );

  for (const route of dispatchRoutes) {
    if (!visibleRouteKeys.has(route.route_key)) continue;

    if (route.driver) ids.add(route.driver.roster_member_id);
    for (const person of route.helpers) ids.add(person.roster_member_id);
    for (const person of route.trainees) ids.add(person.roster_member_id);
    for (const person of route.extras) ids.add(person.roster_member_id);
  }

  return ids;
}

export function buildWorkforce(params: {
  allPeople: DispatchPerson[];
  assignedIds: Set<string>;
  calloutIds: Set<string>;
}) {
  const { allPeople, assignedIds, calloutIds } = params;
  const available = allPeople.filter(
    (person) =>
      !assignedIds.has(person.roster_member_id) &&
      !calloutIds.has(person.roster_member_id)
  );
  const drivers = allPeople.filter((person) => {
    const label = personTypeLabel(person).toLowerCase();
    return !label.includes("helper") && !label.includes("trainee");
  });
  const helpers = allPeople.filter((person) =>
    personTypeLabel(person).toLowerCase().includes("helper")
  );
  const trainees = allPeople.filter((person) =>
    personTypeLabel(person).toLowerCase().includes("trainee")
  );

  return {
    available,
    drivers,
    helpers,
    trainees,
  };
}

export function buildUnscheduledDrivers(params: {
  allPeople: DispatchPerson[];
  rosterRows: DispatchRosterRow[];
  scheduledRosterIds: Set<string>;
}) {
  const { allPeople, rosterRows, scheduledRosterIds } = params;
  const scheduledOrAdded = new Set(allPeople.map((person) => person.roster_member_id));

  return rosterRows
    .filter((row) => !scheduledRosterIds.has(row.roster_member_id))
    .filter((row) => !scheduledOrAdded.has(row.roster_member_id))
    .filter((row) => {
      const status = (row.employment_status ?? "").toLowerCase();
      if (status && status !== "active") return false;

      const worker = `${row.worker_type ?? ""} ${row.full_name ?? ""}`.toLowerCase();
      return !worker.includes("helper") && !worker.includes("trainee");
    })
    .map(
      (row): DispatchPerson => ({
        roster_member_id: row.roster_member_id,
        full_name: row.full_name?.trim() || "Unnamed driver",
        worker_type: row.worker_type,
        source_kind: "ROSTER_UNSCHEDULED",
        override_type: null,
      })
    )
    .sort(personSort);
}

export function buildAvailableRoutes(params: {
  dispatchRoutes: DispatchRoute[];
  routes: RouteRow[];
  routeSort: (a: DispatchRoute, b: DispatchRoute) => number;
}) {
  const { dispatchRoutes, routes, routeSort } = params;
  const assignedKeys = new Set(dispatchRoutes.map((route) => route.route_key));

  return routes
    .map(
      (route): DispatchRoute => {
        const key = cleanRouteKey(route.current_wa_num || route.route_name);

        return {
          route_key: key,
          route_name: route.route_name?.trim() || key,
          current_wa_num: route.current_wa_num,
          route_location: route.route_location,
          route_type: route.route_type,
          driver: null,
          helpers: [],
          trainees: [],
          extras: [],
        };
      }
    )
    .filter((route) => !assignedKeys.has(route.route_key))
    .sort(routeSort);
}

export function buildPlanningRoutes(params: {
  droPlanRows: DroPlanRow[];
  planningDate: string;
  routeSort: (a: DispatchRoute, b: DispatchRoute) => number;
  routes: RouteRow[];
}) {
  const { droPlanRows, planningDate, routeSort, routes } = params;

  if (droPlanRows.length > 0) {
    return droPlanRows
      .map(
        (row): DispatchRoute => {
          const key = cleanRouteKey(row.wa_number || row.route_name);

          return {
            route_key: key,
            route_name: row.route_name?.trim() || key,
            current_wa_num: row.wa_number,
            route_location: `${row.stops ?? 0} stops • ${row.packages ?? 0} pkgs`,
            route_type: row.time_commits
              ? `${row.time_commits} commits`
              : "DRO forecast",
            driver: null,
            helpers: [],
            trainees: [],
            extras: [],
          };
        }
      )
      .sort(routeSort);
  }

  const runFlag = runFlagForDate(planningDate);

  return routes
    .filter((route) => Boolean(route[runFlag as keyof RouteRow]))
    .map(
      (route): DispatchRoute => {
        const key = cleanRouteKey(route.current_wa_num || route.route_name);

        return {
          route_key: key,
          route_name: route.route_name?.trim() || key,
          current_wa_num: route.current_wa_num,
          route_location: route.route_location,
          route_type: route.route_type,
          driver: null,
          helpers: [],
          trainees: [],
          extras: [],
        };
      }
    )
    .sort(routeSort);
}

export function buildDispatchSummary(
  dispatchRoutes: DispatchRoute[],
  availableCount: number
) {
  const total = dispatchRoutes.length;
  const withDriver = dispatchRoutes.filter((route) => route.driver).length;
  const withoutDriver = total - withDriver;
  const helpers = dispatchRoutes.reduce((sum, route) => sum + route.helpers.length, 0);
  const trainees = dispatchRoutes.reduce((sum, route) => sum + route.trainees.length, 0);

  return {
    total,
    withDriver,
    withoutDriver,
    helpers,
    trainees,
    available: availableCount,
  };
}

export function findUnscheduledDriverCandidates(params: {
  allPeople: DispatchPerson[];
  rosterRows: DispatchRosterRow[];
  scheduledRosterIds: Set<string>;
}) {
  const { allPeople, rosterRows, scheduledRosterIds } = params;
  const scheduledOrAdded = new Set(allPeople.map((person) => person.roster_member_id));

  return rosterRows
    .filter((row) => !scheduledRosterIds.has(row.roster_member_id))
    .filter((row) => !scheduledOrAdded.has(row.roster_member_id))
    .filter((row) => {
      const status = (row.employment_status ?? "").toLowerCase();
      if (status && status !== "active") return false;

      const worker = `${row.worker_type ?? ""} ${row.full_name ?? ""}`.toLowerCase();
      return !worker.includes("helper") && !worker.includes("trainee");
    })
    .sort((a, b) =>
      (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
}
