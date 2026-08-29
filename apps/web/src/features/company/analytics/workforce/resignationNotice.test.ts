import { describe, expect, it } from "vitest";
import { buildResignationNoticeCountdowns } from "./resignationNotice";

const roster = [
  {
    roster_member_id: "active-1",
    full_name: "Alex Driver",
    worker_type: "Driver",
    employment_status: "Active",
  },
  {
    roster_member_id: "trainee-1",
    full_name: "Taylor Trainee",
    worker_type: "Driver",
    employment_status: "Trainee",
  },
];

describe("buildResignationNoticeCountdowns", () => {
  it("counts down to the final scheduled day and identifies route-ready loss", () => {
    const notices = buildResignationNoticeCountdowns([
      {
        id: "notice-1",
        roster_member_id: "active-1",
        override_type: "RESIGNATION_NOTICE",
        start_date: "2026-08-04",
        end_date: "2026-08-14",
        separation_effective_date: "2026-08-15",
        workflow_status: "COUNTDOWN_ACTIVE",
        is_active: true,
      },
    ], roster, "2026-08-07");

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      days_until_last_day: 7,
      days_until_separation: 8,
      route_ready_departure: true,
    });
  });

  it("keeps trainee notices visible without reducing route-ready capacity", () => {
    const notices = buildResignationNoticeCountdowns([
      {
        id: "notice-2",
        roster_member_id: "trainee-1",
        start_date: "2026-08-06",
        end_date: "2026-08-08",
        is_active: true,
      },
    ], roster, "2026-08-07");

    expect(notices[0].route_ready_departure).toBe(false);
  });

  it("keeps part-time driver notices visible without reducing full-time readiness", () => {
    const notices = buildResignationNoticeCountdowns([
      {
        id: "notice-3",
        roster_member_id: "active-1",
        start_date: "2026-08-06",
        end_date: "2026-08-14",
        is_active: true,
      },
    ], [
      {
        ...roster[0],
        driver_utilization_category: "PART_TIME" as const,
      },
    ], "2026-08-07");

    expect(notices[0].route_ready_departure).toBe(false);
  });

  it("keeps non-driver notices visible without reducing route-ready capacity", () => {
    const notices = buildResignationNoticeCountdowns([
      {
        id: "notice-4",
        roster_member_id: "manager-1",
        start_date: "2026-08-06",
        end_date: "2026-08-14",
        is_active: true,
      },
    ], [{
      roster_member_id: "manager-1",
      full_name: "Fleet Manager",
      worker_type: "Fleet Manager",
      employment_status: "Active",
    }], "2026-08-07");

    expect(notices[0].route_ready_departure).toBe(false);
  });

  it("excludes cancelled, completed, and former-roster notices", () => {
    const notices = buildResignationNoticeCountdowns([
      {
        id: "cancelled",
        roster_member_id: "active-1",
        start_date: "2026-08-01",
        end_date: "2026-08-14",
        workflow_status: "CANCELLED",
        is_active: true,
      },
      {
        id: "completed",
        roster_member_id: "active-1",
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        separation_effective_date: "2026-08-01",
        is_active: true,
      },
      {
        id: "former",
        roster_member_id: "former-1",
        start_date: "2026-08-01",
        end_date: "2026-08-14",
        is_active: true,
      },
    ], roster, "2026-08-07");

    expect(notices).toEqual([]);
  });
});
