import type { ManagerOperationsRoute } from "./managerWorkspace";

export type ManagerDispatchActionCode = string;

export type ManagerDispatchEventType = {
  code: ManagerDispatchActionCode;
  label: string;
  category: string;
  requiresPerson: boolean;
  requiresRoute: boolean;
  allowsNote: boolean;
  requiresNote: boolean;
};

export type ManagerDispatchPerson = {
  rosterMemberId: string;
  fullName: string;
  workerType: string;
  employmentStatus: string;
  arrived: boolean;
  assignedRouteId: string | null;
  assignedSeat: "driver" | "helper" | "trainee" | null;
};

export type ManagerDispatchRoute = ManagerOperationsRoute & {
  dispatchRouteKey: string;
  driverRosterMemberId: string | null;
  helperRosterMemberIds: string[];
  helperNames: string[];
  traineeRosterMemberIds: string[];
  traineeNames: string[];
};

export type ManagerDispatchEvent = {
  id: string;
  eventCode: string;
  eventLabel: string;
  eventCategory: string;
  personName: string | null;
  routeLabel: string | null;
  note: string | null;
  createdAt: string;
};

export type ManagerDispatchSnapshot = {
  serviceDate: string;
  terminalCode: string | null;
  timeZone: string;
  dayStatus: "ACTIVE" | "LOCKED";
  routes: ManagerDispatchRoute[];
  people: ManagerDispatchPerson[];
  events: ManagerDispatchEvent[];
  eventTypes: ManagerDispatchEventType[];
};

export type ManagerDispatchActionDraft = {
  phase?: "DISPATCH" | "DELIVERY";
  code: ManagerDispatchActionCode;
  routeId: string | null;
  rosterMemberId: string | null;
  manualRoute: string;
  note: string;
};

export type ManagerDispatchActionDefinition = {
  code: ManagerDispatchActionCode;
  label: string;
  category: string;
  requiresRoute: boolean;
  requiresManualRoute: boolean;
  requiresPerson: boolean;
  allowsNote: boolean;
  requiresNote: boolean;
  notePrompt: string | null;
};

export const MANAGER_DISPATCH_ACTIONS: ManagerDispatchActionDefinition[] = [
  { code: "ASSIGN_DRIVER", label: "Assign driver", category: "Assignment", requiresRoute: true, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: null },
  { code: "UNASSIGN_DRIVER", label: "Clear driver", category: "Assignment", requiresRoute: true, requiresManualRoute: false, requiresPerson: false, allowsNote: true, requiresNote: false, notePrompt: "Why is this seat being cleared? (optional)" },
  { code: "ASSIGN_HELPER", label: "Assign helper", category: "Assignment", requiresRoute: true, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: null },
  { code: "UNASSIGN_HELPER", label: "Clear helpers", category: "Assignment", requiresRoute: true, requiresManualRoute: false, requiresPerson: false, allowsNote: true, requiresNote: false, notePrompt: "Why are the helper seats being cleared? (optional)" },
  { code: "ASSIGN_TRAINEE", label: "Assign trainee", category: "Assignment", requiresRoute: true, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: null },
  { code: "UNASSIGN_TRAINEE", label: "Clear trainees", category: "Assignment", requiresRoute: true, requiresManualRoute: false, requiresPerson: false, allowsNote: true, requiresNote: false, notePrompt: "Why are the trainee seats being cleared? (optional)" },
  { code: "ADD_DRIVER", label: "Add driver", category: "Workforce", requiresRoute: false, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: "Why is this driver being added? (optional)" },
  { code: "ADD_ROUTE", label: "Add route", category: "Operations", requiresRoute: false, requiresManualRoute: true, requiresPerson: false, allowsNote: true, requiresNote: false, notePrompt: "Why is this route being added? (optional)" },
  { code: "REMOVE_ROUTE", label: "Remove route", category: "Operations", requiresRoute: true, requiresManualRoute: false, requiresPerson: false, allowsNote: true, requiresNote: false, notePrompt: "Why is this route being removed? (optional)" },
  { code: "ARRIVED", label: "Mark arrived", category: "Workforce", requiresRoute: false, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: null },
  { code: "UNDO_ARRIVED", label: "Undo arrival", category: "Workforce", requiresRoute: false, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: "Reason for correcting arrival (optional)" },
  { code: "CALL_OUT", label: "Call out", category: "Workforce", requiresRoute: false, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: "Call-out context (optional)" },
  { code: "NO_SHOW", label: "No show", category: "Workforce", requiresRoute: false, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: "No-show context (optional)" },
  { code: "LATE_ARRIVAL", label: "Late arrival", category: "Workforce", requiresRoute: false, requiresManualRoute: false, requiresPerson: true, allowsNote: true, requiresNote: false, notePrompt: "Late-arrival context (optional)" },
];

export function dispatchActionDefinitions(snapshot: ManagerDispatchSnapshot) {
  const actions = new Map<string, ManagerDispatchActionDefinition>();
  MANAGER_DISPATCH_ACTIONS.forEach((action) => actions.set(action.code, action));
  snapshot.eventTypes
    .filter((eventType) => !["DELIVERY_NOTE", "DRIVER_ASSIST"].includes(eventType.code))
    .forEach((eventType) => {
      if (actions.has(eventType.code)) return;
      actions.set(eventType.code, {
        code: eventType.code,
        label: eventType.label,
        category: eventType.category,
        requiresRoute: eventType.requiresRoute,
        requiresManualRoute: false,
        requiresPerson: eventType.requiresPerson,
        allowsNote: eventType.allowsNote,
        requiresNote: eventType.requiresNote || eventType.code === "PASS_ROUTE_TO_CSA",
        notePrompt: eventType.requiresNote ? "Required dispatch context" : "Optional note or dispatch context",
      });
    });
  return [...actions.values()];
}

export function dispatchActionDefinition(code: ManagerDispatchActionCode, snapshot?: ManagerDispatchSnapshot) {
  return (snapshot ? dispatchActionDefinitions(snapshot) : MANAGER_DISPATCH_ACTIONS)
    .find((action) => action.code === code) ?? MANAGER_DISPATCH_ACTIONS[0];
}

export function validateDispatchAction(
  draft: ManagerDispatchActionDraft,
  snapshot: ManagerDispatchSnapshot,
) {
  const action = dispatchActionDefinition(draft.code, snapshot);
  if (action.requiresRoute && !draft.routeId) return "Choose a route.";
  if (action.requiresManualRoute && !draft.manualRoute.trim()) return "Enter the route or WA number.";
  if (action.requiresPerson && !draft.rosterMemberId) return "Choose a person.";
  if (action.requiresNote && !draft.note.trim()) return "Add the required action context.";
  if (draft.routeId && !snapshot.routes.some((route) => route.id === draft.routeId)) return "That route is outside the active board.";
  if (draft.rosterMemberId && !snapshot.people.some((person) => person.rosterMemberId === draft.rosterMemberId)) return "That person is outside the active company roster.";
  if (draft.code === "UNASSIGN_DRIVER") {
    const route = snapshot.routes.find((candidate) => candidate.id === draft.routeId);
    if (!route?.driverName) return "That route does not have a driver to clear.";
  }
  if (draft.code === "UNASSIGN_HELPER") {
    const route = snapshot.routes.find((candidate) => candidate.id === draft.routeId);
    if (!route?.helperRosterMemberIds.length) return "That route does not have helpers to clear.";
  }
  if (draft.code === "UNASSIGN_TRAINEE") {
    const route = snapshot.routes.find((candidate) => candidate.id === draft.routeId);
    if (!route?.traineeRosterMemberIds.length) return "That route does not have trainees to clear.";
  }
  if (["ASSIGN_DRIVER", "ASSIGN_HELPER", "ASSIGN_TRAINEE"].includes(draft.code)) {
    const person = snapshot.people.find((candidate) => candidate.rosterMemberId === draft.rosterMemberId);
    if (person?.assignedRouteId && person.assignedRouteId !== draft.routeId) {
      return `${person.fullName} is already assigned to another route.`;
    }
  }
  if (draft.code === "ADD_ROUTE") {
    const routeKey = draft.manualRoute.trim().toLowerCase();
    if (snapshot.routes.some((route) => [route.routeName, route.workArea, route.dispatchRouteKey]
      .some((value) => String(value ?? "").trim().toLowerCase() === routeKey))) {
      return "That route is already on the active board.";
    }
  }
  return null;
}
