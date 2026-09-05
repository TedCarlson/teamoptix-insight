import {
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRoute,
  type Seat,
  getReversedDispatchEventIds,
} from "./dispatchSupport";

export function dispatchPersonFromEvent(event: DispatchEventRow): DispatchPerson | null {
  if (!event.person_roster_member_id || !event.person_name) return null;

  return {
    roster_member_id: event.person_roster_member_id,
    full_name: event.person_name,
    worker_type: null,
    source_kind: "DISPATCH_EVENT",
    override_type: null,
  };
}

export function removePersonFromRoute(
  route: DispatchRoute,
  rosterMemberId: string
): DispatchRoute {
  return {
    ...route,
    driver:
      route.driver?.roster_member_id === rosterMemberId ? null : route.driver,
    helpers: route.helpers.filter((person) => person.roster_member_id !== rosterMemberId),
    trainees: route.trainees.filter((person) => person.roster_member_id !== rosterMemberId),
    extras: route.extras.filter((person) => person.roster_member_id !== rosterMemberId),
  };
}

export function applyDispatchEvent(
  current: Record<string, DispatchRoute>,
  event: DispatchEventRow
): Record<string, DispatchRoute> {
  const code = event.event_code;
  const routeKey = event.route_key ?? event.to_route_key ?? null;
  const seat = event.seat as Seat | null;
  const person = dispatchPersonFromEvent(event);

  if (code === "OPERATIONS_CLOSED") {
    return {};
  }

  if (code === "ADD_ROUTE") {
    if (!routeKey) return current;
    if (current[routeKey]) return current;

    const payload = event.event_payload ?? {};

    return {
      ...current,
      [routeKey]: {
        route_key: routeKey,
        route_name:
          typeof payload.route_name === "string"
            ? payload.route_name
            : event.route_label ?? routeKey,
        current_wa_num:
          typeof payload.current_wa_num === "string" ? payload.current_wa_num : null,
        route_location:
          typeof payload.route_location === "string" ? payload.route_location : null,
        route_type:
          typeof payload.route_type === "string" ? payload.route_type : "ADDED",
        driver: null,
        helpers: [],
        trainees: [],
        extras: [],
      },
    };
  }

  if (code === "REMOVE_ROUTE" || code === "PASS_ROUTE_TO_CSA") {
    if (!routeKey || !current[routeKey]) return current;

    const next = { ...current };
    delete next[routeKey];
    return next;
  }

  if (!seat) return current;

  if (code.startsWith("ASSIGN_")) {
    if (!routeKey || !person || !current[routeKey]) return current;

    const next: Record<string, DispatchRoute> = {};

    for (const [key, route] of Object.entries(current)) {
      next[key] = removePersonFromRoute(route, person.roster_member_id);
    }

    const target = next[routeKey];
    if (!target) return current;

    if (seat === "driver") {
      target.driver = person;
    }

    if (seat === "helper") {
      target.helpers = [...target.helpers, person];
    }

    if (seat === "trainee") {
      target.trainees = [...target.trainees, person];
    }

    next[routeKey] = target;
    return next;
  }

  if (code.startsWith("UNASSIGN_")) {
    if (!routeKey || !current[routeKey]) return current;

    const target = current[routeKey];
    const nextRoute: DispatchRoute = { ...target };

    if (person) {
      const cleaned = removePersonFromRoute(nextRoute, person.roster_member_id);
      return { ...current, [routeKey]: cleaned };
    }

    if (seat === "driver") nextRoute.driver = null;
    if (seat === "helper") nextRoute.helpers = [];
    if (seat === "trainee") nextRoute.trainees = [];

    return { ...current, [routeKey]: nextRoute };
  }

  return current;
}

export function buildAssignmentMapFromRoutesAndEvents(
  hydratedRoutes: DispatchRoute[],
  dispatchEvents: DispatchEventRow[]
): Record<string, DispatchRoute> {
  let next: Record<string, DispatchRoute> = {};

  for (const route of hydratedRoutes) {
    next[route.route_key] = {
      ...route,
      helpers: [...route.helpers],
      trainees: [...route.trainees],
      extras: [...route.extras],
    };
  }

  const orderedEvents = [...dispatchEvents].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  const reversedEventIds = getReversedDispatchEventIds(orderedEvents);

  for (const event of orderedEvents) {
    if (reversedEventIds.has(event.id)) continue;
    if (event.event_code.startsWith("UNDO_")) continue;

    next = applyDispatchEvent(next, event);
  }

  return next;
}
