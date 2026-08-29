import { describe, expect, it } from "vitest";
import {
  isDriverSeatWorker,
  resolveDailyScheduleCapacity,
  resolveBaselineScheduledOffDrivers,
  resolveOverrideOffRows,
  resolveScheduleOverrideImpact,
  type ScheduleCapacityPerson,
} from "./scheduleCapacity";

function person(
  overrides: Partial<ScheduleCapacityPerson>
): ScheduleCapacityPerson {
  return {
    roster_member_id: "driver-1",
    full_name: "Driver One",
    worker_type: "Driver",
    employment_status: "Active",
    planned_on: false,
    route_name: null,
    override_type: null,
    ...overrides,
  };
}

describe("resolveBaselineScheduledOffDrivers", () => {
  it("returns baseline driver-seat rows that are scheduled off", () => {
    const scheduledOff = resolveBaselineScheduledOffDrivers([
      person({ roster_member_id: "driver-off" }),
      person({ roster_member_id: "driver-on", planned_on: true }),
      person({
        roster_member_id: "call-out",
        override_type: "CALL_OUT",
      }),
      person({ roster_member_id: "helper-off", worker_type: "Helper" }),
      person({ roster_member_id: "jumper-off", worker_type: "Jumper" }),
      person({ roster_member_id: "trainee-off", worker_type: "Trainee" }),
      person({
        roster_member_id: "driver-labelled-trainee-off",
        worker_type: "Driver",
        employment_status: "Trainee",
      }),
    ]);

    expect(scheduledOff.map((row) => row.roster_member_id)).toEqual([
      "driver-off",
    ]);
  });
});

describe("driver readiness classification", () => {
  it("uses trainee lifecycle status even when the worker type says Driver", () => {
    expect(isDriverSeatWorker("Driver", "Trainee")).toBe(false);
    expect(isDriverSeatWorker("Driver", "Active")).toBe(true);
  });

  it("does not count scheduled trainees as available driver capacity", () => {
    const capacity = resolveDailyScheduleCapacity({
      serviceDate: "2026-08-22",
      routes: [
        {
          id: "route-1",
          route_name: "Route 1",
          current_wa_num: "WA-1",
          runs_s: true,
          runs_u: false,
          runs_m: false,
          runs_t: false,
          runs_w: false,
          runs_h: false,
          runs_f: false,
        },
        {
          id: "route-2",
          route_name: "Route 2",
          current_wa_num: "WA-2",
          runs_s: true,
          runs_u: false,
          runs_m: false,
          runs_t: false,
          runs_w: false,
          runs_h: false,
          runs_f: false,
        },
      ],
      scheduleRows: [
        person({
          roster_member_id: "active-driver",
          planned_on: true,
          route_name: "WA-1",
        }),
        person({
          roster_member_id: "trainee-with-driver-label",
          employment_status: "Trainee",
          planned_on: true,
        }),
      ],
    });

    expect(capacity.scheduledDrivers).toBe(1);
    expect(capacity.assignedDrivers).toBe(1);
    expect(capacity.standbyDrivers).toEqual([]);
    expect(capacity.openRoutes.map((route) => route.id)).toEqual(["route-2"]);
    expect(capacity.capacityDelta).toBe(-1);
    expect(capacity.routeCoveragePercent).toBe(50);
    expect(capacity.coveredRoutesByProgram).toEqual({ STANDARD: 1, AVP: 0 });
    expect(capacity.seams.map((seam) => seam.type)).toEqual([
      "UNCOVERED_ROUTE",
    ]);
  });

  it("lets standard and AVP assignments cover routes without treating other roles as drivers", () => {
    const capacity = resolveDailyScheduleCapacity({
      serviceDate: "2026-08-22",
      routes: [
        {
          id: "route-1", route_name: "Route 1", current_wa_num: "WA-1",
          runs_s: true, runs_u: false, runs_m: false, runs_t: false,
          runs_w: false, runs_h: false, runs_f: false,
        },
        {
          id: "route-2", route_name: "Route 2", current_wa_num: "WA-2",
          runs_s: true, runs_u: false, runs_m: false, runs_t: false,
          runs_w: false, runs_h: false, runs_f: false,
        },
      ],
      scheduleRows: [
        person({ roster_member_id: "standard", worker_type: "Driver", planned_on: true, route_name: "WA-1" }),
        person({ roster_member_id: "avp", worker_type: "AVP Driver", planned_on: true, route_name: "Route 2" }),
        person({ roster_member_id: "mechanic", worker_type: "Mechanic", planned_on: true, route_name: "WA-1" }),
      ],
    });

    expect(capacity.scheduledDrivers).toBe(2);
    expect(capacity.assignedRoutes).toBe(2);
    expect(capacity.routeCoveragePercent).toBe(100);
    expect(capacity.coveredRoutesByProgram).toEqual({ STANDARD: 1, AVP: 1 });
    expect(capacity.seams).toEqual([
      expect.objectContaining({ type: "NON_DRIVER_ROUTE_ASSIGNMENT", rosterMemberIds: ["mechanic"] }),
    ]);
  });

  it("surfaces duplicate and out-of-baseline assignments as reporting seams", () => {
    const capacity = resolveDailyScheduleCapacity({
      serviceDate: "2026-08-22",
      routes: [{
        id: "route-1", route_name: "Route 1", current_wa_num: "WA-1",
        runs_s: true, runs_u: false, runs_m: false, runs_t: false,
        runs_w: false, runs_h: false, runs_f: false,
      }],
      scheduleRows: [
        person({ roster_member_id: "driver-1", planned_on: true, route_name: "WA-1" }),
        person({ roster_member_id: "driver-2", planned_on: true, route_name: "Route 1" }),
        person({ roster_member_id: "driver-3", planned_on: true, route_name: "Ad hoc 99" }),
      ],
    });

    expect(capacity.assignedRoutes).toBe(1);
    expect(capacity.coveredRoutesByProgram.STANDARD).toBe(1);
    expect(capacity.seams.map((seam) => seam.type)).toEqual([
      "DUPLICATE_ROUTE_ASSIGNMENT",
      "UNMATCHED_ROUTE_ASSIGNMENT",
    ]);
  });

  it("does not report a trainee add-in as a driver-readiness change", () => {
    const impact = resolveScheduleOverrideImpact({
      requestedDates: ["2026-08-22"],
      rosterMemberId: "trainee-with-driver-label",
      overrideType: "ADD_IN",
      routes: [],
      scheduleRows: [],
      worker: {
        full_name: "Trainee One",
        worker_type: "Driver",
        employment_status: "Trainee",
      },
    });

    expect(impact.days[0]).toMatchObject({
      currentScheduledDrivers: 0,
      projectedScheduledDrivers: 0,
      affectsSchedule: false,
    });
  });
});

describe("resolveOverrideOffRows", () => {
  it("keeps override-off rows separate from scheduled off and add-ins", () => {
    const overrideOff = resolveOverrideOffRows([
      person({ roster_member_id: "scheduled-off" }),
      person({
        roster_member_id: "time-off",
        override_type: "TIME_OFF",
      }),
      person({
        roster_member_id: "call-out",
        override_type: "CALL_OUT",
      }),
      person({
        roster_member_id: "admin-off",
        override_type: "ADMIN_OFF",
      }),
      person({
        roster_member_id: "resignation",
        override_type: "RESIGNATION_NOTICE",
      }),
      person({
        roster_member_id: "add-in",
        planned_on: true,
        override_type: "ADD_IN",
      }),
    ]);

    expect(overrideOff.map((row) => row.roster_member_id)).toEqual([
      "time-off",
      "call-out",
      "admin-off",
      "resignation",
    ]);
  });
});
