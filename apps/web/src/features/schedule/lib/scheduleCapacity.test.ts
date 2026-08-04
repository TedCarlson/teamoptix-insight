import { describe, expect, it } from "vitest";
import {
  resolveBaselineScheduledOffDrivers,
  resolveOverrideOffRows,
  type ScheduleCapacityPerson,
} from "./scheduleCapacity";

function person(
  overrides: Partial<ScheduleCapacityPerson>
): ScheduleCapacityPerson {
  return {
    roster_member_id: "driver-1",
    full_name: "Driver One",
    worker_type: "Driver",
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
    ]);

    expect(scheduledOff.map((row) => row.roster_member_id)).toEqual([
      "driver-off",
    ]);
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
