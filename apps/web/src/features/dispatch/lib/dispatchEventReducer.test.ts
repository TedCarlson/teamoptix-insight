import { describe, expect, it } from "vitest";
import { buildAssignmentMapFromRoutesAndEvents } from "./dispatchEventReducer";
import type { DispatchEventRow, DispatchRoute } from "./dispatchSupport";

const route: DispatchRoute = {
  route_key: "430",
  route_name: "BPV 01",
  current_wa_num: "430",
  route_location: null,
  route_type: "REGULAR",
  driver: {
    roster_member_id: "driver-1",
    full_name: "Beacon Driver",
    worker_type: "Driver",
    source_kind: "SCHEDULE",
    override_type: null,
  },
  helpers: [],
  trainees: [],
  extras: [],
};

function event(overrides: Partial<DispatchEventRow>): DispatchEventRow {
  return {
    id: "event-1",
    event_code: "PASS_ROUTE_TO_CSA",
    event_label: "Pass route to CSA",
    event_category: "COVERAGE",
    route_key: "430",
    route_label: "430 · BPV 01",
    from_route_key: null,
    from_route_label: null,
    to_route_key: null,
    to_route_label: null,
    seat: null,
    person_roster_member_id: null,
    person_name: null,
    note: "Passed to Derwood.",
    event_payload: { receiving_csa: "Derwood", resource_relief: true },
    created_at: "2026-08-08T08:00:00.000Z",
    ...overrides,
  };
}

describe("route-to-CSA dispatch handoff", () => {
  it("removes the handed-off route from the active resource plan", () => {
    const assignments = buildAssignmentMapFromRoutesAndEvents(
      [route],
      [event({})]
    );

    expect(assignments).toEqual({});
  });

  it("restores the route when the handoff event is undone", () => {
    const assignments = buildAssignmentMapFromRoutesAndEvents(
      [route],
      [
        event({}),
        event({
          id: "undo-1",
          event_code: "UNDO_PASS_ROUTE_TO_CSA",
          event_label: "Undo: Pass route to CSA",
          event_payload: { reverses_event_id: "event-1" },
          created_at: "2026-08-08T08:05:00.000Z",
        }),
      ]
    );

    expect(assignments["430"]?.driver?.full_name).toBe("Beacon Driver");
  });
});

describe("driver assignment displacement", () => {
  it("returns the prior scheduled driver to the workforce instead of hiding them as an extra", () => {
    const assignments = buildAssignmentMapFromRoutesAndEvents(
      [route],
      [
        event({
          event_code: "ASSIGN_DRIVER",
          event_label: "Driver assigned",
          seat: "driver",
          person_roster_member_id: "driver-2",
          person_name: "Replacement Driver",
        }),
      ]
    );

    expect(assignments["430"]?.driver?.full_name).toBe("Replacement Driver");
    expect(assignments["430"]?.extras).toEqual([]);
  });
});
