import { describe, expect, it } from "vitest";
import {
  buildArrivedPersonIds,
  buildAssignedIds,
  buildEffectiveCalloutIds,
  buildScheduledRosterIds,
  buildUnscheduledDrivers,
  buildWorkforce,
} from "./dispatchSelectors";
import type {
  DispatchPerson,
  DispatchRosterRow,
  DispatchRoute,
  GeneratedScheduleRow,
} from "./dispatchSupport";

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

  it("lets an arrival recover a person from a prior callout posture", () => {
    const arrivedPersonIds = buildArrivedPersonIds([
      {
        id: "callout",
        created_at: "2026-08-12T10:00:00.000Z",
        event_category: "ATTENDANCE",
        event_code: "CALL_OUT",
        event_label: "Called out",
        note: null,
        route_key: null,
        route_label: null,
        from_route_key: null,
        from_route_label: null,
        to_route_key: null,
        to_route_label: null,
        seat: null,
        person_roster_member_id: ricky.roster_member_id,
        person_name: ricky.full_name,
        event_payload: {},
      },
      {
        id: "arrival",
        created_at: "2026-08-12T11:00:00.000Z",
        event_category: "WORKFORCE",
        event_code: "ARRIVED",
        event_label: "Arrived",
        note: null,
        route_key: null,
        route_label: null,
        from_route_key: null,
        from_route_label: null,
        to_route_key: null,
        to_route_label: null,
        seat: null,
        person_roster_member_id: ricky.roster_member_id,
        person_name: ricky.full_name,
        event_payload: {},
      },
    ]);
    const effectiveCalloutIds = buildEffectiveCalloutIds(
      [ricky],
      arrivedPersonIds
    );

    const workforce = buildWorkforce({
      allPeople: [ricky],
      assignedIds: new Set(),
      calloutIds: effectiveCalloutIds,
    });

    expect(workforce.available).toContain(ricky);
  });

  it("only treats people planned on as scheduled", () => {
    const scheduleRows: GeneratedScheduleRow[] = [
      {
        id: "off-row",
        service_date: "2026-08-02",
        roster_member_id: "off-driver",
        full_name: "Off Driver",
        worker_type: "Driver",
        planned_on: false,
        route_name: null,
        source_kind: "GENERATED_SCHEDULE",
        override_type: null,
      },
      {
        id: "on-row",
        service_date: "2026-08-02",
        roster_member_id: "on-driver",
        full_name: "On Driver",
        worker_type: "Driver",
        planned_on: true,
        route_name: "101",
        source_kind: "GENERATED_SCHEDULE",
        override_type: null,
      },
      {
        id: "callout-row",
        service_date: "2026-08-02",
        roster_member_id: "callout-driver",
        full_name: "Callout Driver",
        worker_type: "Driver",
        planned_on: false,
        route_name: null,
        source_kind: "SCHEDULE_OVERRIDE",
        override_type: "CALL_OUT",
      },
    ];

    expect(buildScheduledRosterIds(scheduleRows, "2026-08-02")).toEqual(
      new Set(["on-driver", "callout-driver"])
    );
  });

  it("offers every active, unscheduled roster role", () => {
    const rosterRows: DispatchRosterRow[] = [
      { roster_member_id: "driver", full_name: "A Driver", worker_type: "Driver", employment_status: "Active" },
      { roster_member_id: "lead", full_name: "B Lead", worker_type: "Lead Driver", employment_status: "Active" },
      { roster_member_id: "mechanic", full_name: "C Mechanic", worker_type: "Mechanic", employment_status: "Active" },
      { roster_member_id: "fleet", full_name: "D Fleet", worker_type: "Fleet Manager", employment_status: "Active" },
      { roster_member_id: "candidate", full_name: "E Candidate", worker_type: "Driver", employment_status: "Candidate" },
      { roster_member_id: "scheduled", full_name: "F Scheduled", worker_type: "Driver", employment_status: "Active" },
    ];

    const result = buildUnscheduledDrivers({
      allPeople: [],
      rosterRows,
      scheduledRosterIds: new Set(["scheduled"]),
    });

    expect(result.map((person) => person.roster_member_id)).toEqual([
      "driver",
      "lead",
      "mechanic",
      "fleet",
    ]);
  });
});
