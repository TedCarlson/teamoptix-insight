import {
  dispatchActionDefinitions,
  validateDispatchAction,
  type ManagerDispatchSnapshot,
} from "./managerDispatch";

const snapshot: ManagerDispatchSnapshot = {
  serviceDate: "2026-08-11",
  terminalCode: "BPV",
  timeZone: "America/New_York",
  dayStatus: "ACTIVE",
  routes: [{
    id: "route-1",
    dispatchRouteKey: "430",
    routeName: "BPV 01",
    workArea: "430",
    driverName: null,
    driverRosterMemberId: null,
    helperRosterMemberIds: [],
    helperNames: [],
    traineeRosterMemberIds: [],
    traineeNames: [],
    phase: "unassigned",
    completedStops: 0,
    plannedStops: 80,
    completedPackages: 0,
    plannedPackages: 100,
    completedPickups: 0,
    plannedPickups: 1,
    expressComplete: 0,
    expressAttempted: 0,
    expressOpen: 2,
    expressTotal: 2,
    ilsPercent: null,
    progressPercent: 0,
  }],
  people: [{
    rosterMemberId: "person-1",
    fullName: "Driver One",
    workerType: "Driver",
    employmentStatus: "Active",
    arrived: false,
    assignedRouteId: null,
    assignedSeat: null,
  }],
  events: [],
  eventTypes: [],
};

describe("manager dispatch actions", () => {
  it("requires the route and person for driver assignment", () => {
    expect(validateDispatchAction({ code: "ASSIGN_DRIVER", routeId: null, rosterMemberId: null, manualRoute: "", note: "" }, snapshot)).toBe("Choose a route.");
    expect(validateDispatchAction({ code: "ASSIGN_DRIVER", routeId: "route-1", rosterMemberId: null, manualRoute: "", note: "" }, snapshot)).toBe("Choose a person.");
    expect(validateDispatchAction({ code: "ASSIGN_DRIVER", routeId: "route-1", rosterMemberId: "person-1", manualRoute: "", note: "" }, snapshot)).toBeNull();
  });

  it("requires a new route identity and rejects an active route", () => {
    expect(validateDispatchAction({ code: "ADD_ROUTE", routeId: null, rosterMemberId: null, manualRoute: "", note: "" }, snapshot)).toBe("Enter the route or WA number.");
    expect(validateDispatchAction({ code: "ADD_ROUTE", routeId: null, rosterMemberId: null, manualRoute: "430", note: "" }, snapshot)).toBe("That route is already on the active board.");
    expect(validateDispatchAction({ code: "ADD_ROUTE", routeId: null, rosterMemberId: null, manualRoute: "BPV 24", note: "" }, snapshot)).toBeNull();
  });

  it("uses the chosen action classification after handoff without restoring the old phase gate", () => {
    expect(validateDispatchAction(
      { code: "ARRIVED", routeId: null, rosterMemberId: "person-1", manualRoute: "", note: "" },
      { ...snapshot, dayStatus: "LOCKED" },
    )).toBeNull();
  });

  it("keeps route staffing available after operational handoff", () => {
    expect(validateDispatchAction(
      { code: "ASSIGN_HELPER", routeId: "route-1", rosterMemberId: "person-1", manualRoute: "", note: "" },
      { ...snapshot, dayStatus: "LOCKED" },
    )).toBeNull();
  });

  it("adopts the company Dispatch action catalog and its target rules", () => {
    const catalogSnapshot: ManagerDispatchSnapshot = {
      ...snapshot,
      eventTypes: [{
        code: "WAREHOUSE_DELAY",
        label: "Warehouse delay",
        category: "OPERATIONS",
        requiresPerson: false,
        requiresRoute: true,
        allowsNote: true,
        requiresNote: true,
      }],
    };
    expect(dispatchActionDefinitions(catalogSnapshot).some((action) => action.code === "WAREHOUSE_DELAY")).toBe(true);
    expect(validateDispatchAction(
      { code: "WAREHOUSE_DELAY", routeId: null, rosterMemberId: null, manualRoute: "", note: "" },
      catalogSnapshot,
    )).toBe("Choose a route.");
    expect(validateDispatchAction(
      { code: "WAREHOUSE_DELAY", routeId: "route-1", rosterMemberId: null, manualRoute: "", note: "" },
      catalogSnapshot,
    )).toBe("Add the required action context.");
    expect(validateDispatchAction(
      { code: "WAREHOUSE_DELAY", routeId: "route-1", rosterMemberId: null, manualRoute: "", note: "Sort stopped" },
      catalogSnapshot,
    )).toBeNull();
  });
});
