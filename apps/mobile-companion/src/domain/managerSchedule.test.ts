import {
  buildManagerScheduleSnapshot,
  coverageStatus,
  isDriverSeatWorker,
  managerWeekStart,
  resolveManagerScheduleDay,
  type ManagerScheduleRoute,
} from "./managerSchedule";

const route = (id: string, name: string): ManagerScheduleRoute => ({
  id,
  route_name: name,
  current_wa_num: null,
  runs_s: true,
  runs_u: true,
  runs_m: true,
  runs_t: true,
  runs_w: true,
  runs_h: true,
  runs_f: true,
});

describe("manager schedule domain", () => {
  it("uses the Saturday-to-Friday operating week", () => {
    expect(managerWeekStart(new Date(2026, 7, 11))).toBe("2026-08-08");
    expect(managerWeekStart(new Date(2026, 7, 8))).toBe("2026-08-08");
  });

  it("does not count helper seats as driver coverage", () => {
    expect(isDriverSeatWorker("Driver")).toBe(true);
    expect(isDriverSeatWorker("Driver Helper")).toBe(false);
    expect(isDriverSeatWorker("Trainee")).toBe(false);
  });

  it("resolves open routes, standby drivers, and a gap", () => {
    const day = resolveManagerScheduleDay({
      serviceDate: "2026-08-08",
      routes: [route("1", "410"), route("2", "411")],
      rows: [
        { service_date: "2026-08-08", roster_member_id: "a", full_name: "A", worker_type: "Driver", planned_on: true, route_name: "410", override_type: null },
        { service_date: "2026-08-08", roster_member_id: "b", full_name: "B", worker_type: "Helper", planned_on: true, route_name: "411", override_type: null },
      ],
    });
    expect(day.scheduledDrivers).toBe(1);
    expect(day.openRoutes.map((item) => item.route_name)).toEqual(["411"]);
    expect(day.capacityDelta).toBe(-1);
    expect(day.status).toBe("GAP");
  });

  it("builds seven days and keeps pending requests only", () => {
    const snapshot = buildManagerScheduleSnapshot({
      weekStart: "2026-08-08",
      routes: [],
      rows: [],
      overrides: [],
      requests: [
        { id: "1", roster_member_id: "a", full_name: "A", worker_type: "Driver", requested_dates: ["2026-08-11"], start_date: "2026-08-11", end_date: "2026-08-11", day_count: 1, status: "PENDING", request_note: null, manager_note: null, submitted_at: "2026-08-01", reviewed_at: null },
        { id: "2", roster_member_id: "b", full_name: "B", worker_type: "Driver", requested_dates: ["2026-08-12"], start_date: "2026-08-12", end_date: "2026-08-12", day_count: 1, status: "APPROVED", request_note: null, manager_note: null, submitted_at: "2026-08-01", reviewed_at: "2026-08-02" },
      ],
    });
    expect(snapshot.days).toHaveLength(7);
    expect(snapshot.weekEnd).toBe("2026-08-14");
    expect(snapshot.pendingRequests.map((item) => item.id)).toEqual(["1"]);
    expect(coverageStatus(2)).toBe("COVERED");
  });
});
