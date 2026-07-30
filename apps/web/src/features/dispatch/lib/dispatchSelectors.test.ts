import { describe, expect, it } from "vitest";
import { buildAssignedIds, buildWorkforce } from "./dispatchSelectors";
import type { DispatchPerson, DispatchRoute } from "./dispatchSupport";

const ricky: DispatchPerson = {
  roster_member_id: "ricky-brown",
  full_name: "Ricky Brown",
  worker_type: "Driver",
  source_kind: "GENERATED_SCHEDULE",
  override_type: null,
};

function route(routeKey: string, driver: DispatchPerson | null): DispatchRoute {
  return {
    route_key: routeKey,
    route_name: routeKey,
    current_wa_num: routeKey,
    route_location: null,
    route_type: null,
    driver,
    helpers: [],
    trainees: [],
    extras: [],
  };
}

describe("dispatch workforce availability", () => {
  it("excludes a driver assigned to a manually added route", () => {
    const assignedIds = buildAssignedIds([route("451", ricky)]);
    const workforce = buildWorkforce({
      allPeople: [ricky],
      assignedIds,
      calloutIds: new Set(),
    });

    expect(assignedIds).toContain(ricky.roster_member_id);
    expect(workforce.available).not.toContain(ricky);
  });

  it("does not treat the unassigned bucket as an active assignment", () => {
    const assignedIds = buildAssignedIds([route("UNASSIGNED", ricky)]);

    expect(assignedIds).not.toContain(ricky.roster_member_id);
  });
});
