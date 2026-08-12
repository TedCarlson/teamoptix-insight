import type { ManagerAccessContext } from "../domain/access";
import {
  validateDispatchAction,
  type ManagerDispatchActionDraft,
  type ManagerDispatchEvent,
  type ManagerDispatchEventType,
  type ManagerDispatchPerson,
  type ManagerDispatchRoute,
  type ManagerDispatchSnapshot,
} from "../domain/managerDispatch";
import { getSupabaseClient } from "../lib/supabase";
import { loadManagerWorkspaceSnapshot } from "./managerWorkspace";

type DispatchWorkspacePayload = {
  service_date?: string | null;
  terminal_code?: string | null;
  timezone?: string | null;
  dispatch_day?: { status?: string | null } | null;
  events?: DispatchEventRow[];
  event_types?: DispatchEventTypeRow[];
};

type DispatchEventTypeRow = {
  event_code?: string | null;
  event_label?: string | null;
  event_category?: string | null;
  requires_person?: boolean | null;
  requires_route?: boolean | null;
  allows_note?: boolean | null;
  requires_note?: boolean | null;
};

type DispatchEventRow = {
  id?: string | null;
  event_code?: string | null;
  event_label?: string | null;
  event_category?: string | null;
  route_key?: string | null;
  route_label?: string | null;
  to_route_key?: string | null;
  person_roster_member_id?: string | null;
  person_name?: string | null;
  seat?: string | null;
  note?: string | null;
  created_at?: string | null;
};

type RosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  job_title: string | null;
  employment_status: string | null;
  roster_record_kind: string | null;
};

function comparable(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function eventRoute(eventsRoute: string | null | undefined, routes: ManagerDispatchRoute[]) {
  const key = comparable(eventsRoute);
  if (!key) return null;
  return routes.find((route) =>
    [route.dispatchRouteKey, route.routeName, route.workArea, route.id]
      .some((candidate) => comparable(candidate) === key),
  ) ?? null;
}

function eventPresentation(row: DispatchEventRow, index: number): ManagerDispatchEvent {
  return {
    id: String(row.id ?? `dispatch-event-${index}`),
    eventCode: String(row.event_code ?? "DISPATCH_EVENT"),
    eventLabel: String(row.event_label ?? row.event_code ?? "Dispatch event"),
    eventCategory: String(row.event_category ?? "DISPATCH"),
    personName: row.person_name ?? null,
    routeLabel: row.route_label ?? row.route_key ?? null,
    note: row.note ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function loadManagerDispatchSnapshot(
  context: ManagerAccessContext,
): Promise<ManagerDispatchSnapshot> {
  if (!context.grants.includes("dispatch")) throw new Error("Dispatch access is not in this role's scope.");
  const supabase = getSupabaseClient();
  const [workspaceResult, operations, rosterResult] = await Promise.all([
    supabase.rpc("mobile_companion_dispatch_workspace", { p_company_slug: context.company_slug }),
    loadManagerWorkspaceSnapshot(context, "operations"),
    supabase
      .from("company_roster_view")
      .select("roster_member_id, full_name, worker_type, job_title, employment_status, roster_record_kind")
      .eq("company_id", context.company_id)
      .in("employment_status", ["Active", "Trainee"])
      .order("full_name"),
  ]);
  if (workspaceResult.error) throw workspaceResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (!operations.operations) throw new Error("The Operations route board is unavailable.");

  const payload = (workspaceResult.data ?? {}) as DispatchWorkspacePayload;
  const rawEvents = Array.isArray(payload.events) ? [...payload.events] : [];
  rawEvents.sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")));
  const roster = (rosterResult.data ?? []) as RosterRow[];
  const eventTypes: ManagerDispatchEventType[] = (Array.isArray(payload.event_types) ? payload.event_types : [])
    .filter((eventType) => Boolean(eventType.event_code))
    .map((eventType) => ({
      code: String(eventType.event_code),
      label: String(eventType.event_label ?? eventType.event_code),
      category: String(eventType.event_category ?? "DISPATCH"),
      requiresPerson: Boolean(eventType.requires_person),
      requiresRoute: Boolean(eventType.requires_route),
      allowsNote: eventType.allows_note !== false,
      requiresNote: Boolean(eventType.requires_note),
    }));
  const rosterById = new Map(roster.map((person) => [person.roster_member_id, person]));
  const rosterByName = new Map(roster.map((person) => [comparable(person.full_name), person]));

  const routes: ManagerDispatchRoute[] = operations.operations.routes.map((route) => ({
    ...route,
    dispatchRouteKey: String(route.workArea || route.routeName).trim(),
    driverRosterMemberId: rosterByName.get(comparable(route.driverName))?.roster_member_id ?? null,
    helperRosterMemberIds: [],
    helperNames: [],
    traineeRosterMemberIds: [],
    traineeNames: [],
  }));

  for (const event of rawEvents) {
    let route = eventRoute(event.route_key ?? event.to_route_key, routes);
    if (event.event_code === "ADD_ROUTE" && !route && (event.route_key || event.route_label)) {
      const routeName = String(event.route_label || event.route_key).trim();
      const routeKey = String(event.route_key || routeName).trim();
      route = {
        id: `dispatch-added-${comparable(routeKey).replace(/[^a-z0-9]/g, "-")}`,
        dispatchRouteKey: routeKey,
        routeName,
        workArea: routeKey,
        driverName: null,
        driverRosterMemberId: null,
        helperRosterMemberIds: [],
        helperNames: [],
        traineeRosterMemberIds: [],
        traineeNames: [],
        phase: "unassigned",
        completedStops: 0,
        plannedStops: 0,
        completedPackages: 0,
        plannedPackages: 0,
        completedPickups: 0,
        plannedPickups: 0,
        expressComplete: 0,
        expressAttempted: 0,
        expressOpen: 0,
        expressTotal: 0,
        ilsPercent: null,
        progressPercent: 0,
      };
      routes.push(route);
    }
    if (event.event_code === "REMOVE_ROUTE" && route) {
      routes.splice(routes.indexOf(route), 1);
      route = null;
    }
    if (event.event_code?.startsWith("ASSIGN_") && route && event.person_roster_member_id) {
      routes.forEach((candidate) => {
        if (candidate.driverRosterMemberId === event.person_roster_member_id) {
          candidate.driverRosterMemberId = null;
          candidate.driverName = null;
        }
        const helperIndex = candidate.helperRosterMemberIds.indexOf(event.person_roster_member_id!);
        if (helperIndex >= 0) {
          candidate.helperRosterMemberIds.splice(helperIndex, 1);
          candidate.helperNames.splice(helperIndex, 1);
        }
        const traineeIndex = candidate.traineeRosterMemberIds.indexOf(event.person_roster_member_id!);
        if (traineeIndex >= 0) {
          candidate.traineeRosterMemberIds.splice(traineeIndex, 1);
          candidate.traineeNames.splice(traineeIndex, 1);
        }
      });
      const personName = event.person_name || rosterById.get(event.person_roster_member_id)?.full_name || "Assigned team member";
      if (event.event_code === "ASSIGN_DRIVER") {
        route.driverRosterMemberId = event.person_roster_member_id;
        route.driverName = personName;
      }
      if (event.event_code === "ASSIGN_HELPER") {
        route.helperRosterMemberIds.push(event.person_roster_member_id);
        route.helperNames.push(personName);
      }
      if (event.event_code === "ASSIGN_TRAINEE") {
        route.traineeRosterMemberIds.push(event.person_roster_member_id);
        route.traineeNames.push(personName);
      }
    }
    if (event.event_code?.startsWith("UNASSIGN_") && route) {
      if (event.event_code === "UNASSIGN_DRIVER") {
        route.driverRosterMemberId = null;
        route.driverName = null;
      }
      if (event.event_code === "UNASSIGN_HELPER") {
        route.helperRosterMemberIds = [];
        route.helperNames = [];
      }
      if (event.event_code === "UNASSIGN_TRAINEE") {
        route.traineeRosterMemberIds = [];
        route.traineeNames = [];
      }
    }
  }

  const arrived = new Map<string, boolean>();
  rawEvents.forEach((event) => {
    if (!event.person_roster_member_id) return;
    if (event.event_code === "ARRIVED") arrived.set(event.person_roster_member_id, true);
    if (event.event_code === "UNDO_ARRIVED") arrived.set(event.person_roster_member_id, false);
  });
  const assignedRouteByPerson = new Map<string, string>();
  const assignedSeatByPerson = new Map<string, "driver" | "helper" | "trainee">();
  routes.forEach((route) => {
    if (route.driverRosterMemberId) {
      assignedRouteByPerson.set(route.driverRosterMemberId, route.id);
      assignedSeatByPerson.set(route.driverRosterMemberId, "driver");
    }
    route.helperRosterMemberIds.forEach((id) => {
      assignedRouteByPerson.set(id, route.id);
      assignedSeatByPerson.set(id, "helper");
    });
    route.traineeRosterMemberIds.forEach((id) => {
      assignedRouteByPerson.set(id, route.id);
      assignedSeatByPerson.set(id, "trainee");
    });
  });
  const people: ManagerDispatchPerson[] = roster
    .filter((person) => person.roster_record_kind !== "WALK_ON")
    .filter((person) => /driver|trainee|helper|jumper/i.test(`${person.worker_type ?? ""} ${person.job_title ?? ""}`))
    .map((person) => ({
      rosterMemberId: person.roster_member_id,
      fullName: person.full_name || "Unnamed team member",
      workerType: person.worker_type || person.job_title || "Team member",
      employmentStatus: person.employment_status || "Active",
      arrived: arrived.get(person.roster_member_id) ?? false,
      assignedRouteId: assignedRouteByPerson.get(person.roster_member_id) ?? null,
      assignedSeat: assignedSeatByPerson.get(person.roster_member_id) ?? null,
    }));

  return {
    serviceDate: String(payload.service_date ?? operations.operations.serviceDate),
    terminalCode: String(payload.terminal_code ?? operations.operations.terminalCode ?? "").trim() || null,
    timeZone: String(payload.timezone ?? operations.operations.timeZone),
    dayStatus: payload.dispatch_day?.status === "LOCKED" ? "LOCKED" : "ACTIVE",
    routes,
    people,
    events: rawEvents.slice(-30).reverse().map(eventPresentation),
    eventTypes,
  };
}

export async function recordManagerDispatchAction(
  context: ManagerAccessContext,
  snapshot: ManagerDispatchSnapshot,
  draft: ManagerDispatchActionDraft,
) {
  const validation = validateDispatchAction(draft, snapshot);
  if (validation) throw new Error(validation);
  const route = snapshot.routes.find((candidate) => candidate.id === draft.routeId) ?? null;
  const manualRoute = draft.manualRoute.trim();
  const routeKey = draft.code === "ADD_ROUTE" ? manualRoute : route?.dispatchRouteKey ?? null;
  const routeLabel = draft.code === "ADD_ROUTE"
    ? manualRoute
    : route ? [route.routeName, route.workArea].filter(Boolean).join(" · ") : null;
  const selectedPerson = snapshot.people.find((candidate) => candidate.rosterMemberId === draft.rosterMemberId) ?? null;
  const person = draft.code === "UNASSIGN_DRIVER" && route?.driverRosterMemberId
    ? snapshot.people.find((candidate) => candidate.rosterMemberId === route.driverRosterMemberId) ?? null
    : selectedPerson;
  const staffingCodes = ["ASSIGN_DRIVER", "UNASSIGN_DRIVER", "ASSIGN_HELPER", "UNASSIGN_HELPER", "ASSIGN_TRAINEE", "UNASSIGN_TRAINEE"];
  const seat = draft.code.includes("HELPER") ? "helper" : draft.code.includes("TRAINEE") ? "trainee" : "driver";
  const result = await getSupabaseClient().rpc("mobile_companion_record_manager_action", {
    p_company_slug: context.company_slug,
    p_phase: draft.phase ?? "DISPATCH",
    p_event_code: draft.code,
    p_route_key: routeKey,
    p_route_label: routeLabel,
    p_person_roster_member_id: person?.rosterMemberId ?? null,
    p_person_name: person?.fullName ?? route?.driverName ?? null,
    p_seat: staffingCodes.includes(draft.code) ? seat : null,
    p_from_route_key: null,
    p_from_route_label: null,
    p_to_route_key: null,
    p_to_route_label: null,
    p_note: draft.note.trim() || null,
    p_stop_count: null,
    p_event_payload: draft.code === "ADD_ROUTE"
      ? { source: "mobile_dispatch_action_drawer", route_name: manualRoute, current_wa_num: manualRoute, route_type: "ADDED" }
      : draft.code === "PASS_ROUTE_TO_CSA"
        ? { source: "mobile_dispatch_action_drawer", receiving_csa: draft.note.trim(), planning_ownership: "ORIGINATING_CSA", dsw_tracking: "RECEIVING_CSA", resource_relief: true }
      : { source: "mobile_dispatch_action_drawer" },
  });
  if (result.error) throw result.error;
  return result.data;
}
