import {
  buildManagerScheduleSnapshot,
  capacitySignal,
  capacitySignalLabel,
  isDriverSeatWorker,
  isTraineeWorker,
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
    expect(isDriverSeatWorker("Driver", "Trainee")).toBe(false);
    expect(isTraineeWorker("Driver", "Trainee")).toBe(true);
  });

  it("resolves open routes, standby drivers, and a gap", () => {
    const day = resolveManagerScheduleDay({
      serviceDate: "2026-08-08",
      routes: [route("1", "410"), route("2", "411")],
      rows: [
        { service_date: "2026-08-08", roster_member_id: "a", full_name: "A", worker_type: "Driver", employment_status: "Active", planned_on: true, route_name: "410", override_type: null },
        { service_date: "2026-08-08", roster_member_id: "b", full_name: "B", worker_type: "Helper", employment_status: "Active", planned_on: true, route_name: "411", override_type: null },
      ],
    });
    expect(day.scheduledDrivers).toBe(1);
    expect(day.assignedRoutes).toBe(1);
    expect(day.openRoutes.map((item) => item.route_name)).toEqual(["411"]);
    expect(day.capacityDelta).toBe(-1);
    expect(day.signal).toBe("SERVICE_RISK");
  });

  it("separates baseline scheduled-off drivers from override-off rows", () => {
    const day = resolveManagerScheduleDay({
      serviceDate: "2026-08-08",
      routes: [],
      rows: [
        { service_date: "2026-08-08", roster_member_id: "a", full_name: "A", worker_type: "Driver", employment_status: "Active", planned_on: false, route_name: null, override_type: null },
        { service_date: "2026-08-08", roster_member_id: "b", full_name: "B", worker_type: "Driver", employment_status: "Active", planned_on: false, route_name: null, override_type: "TIME_OFF" },
        { service_date: "2026-08-08", roster_member_id: "c", full_name: "C", worker_type: "Helper", employment_status: "Active", planned_on: false, route_name: null, override_type: null },
      ],
    });
    expect(day.baselineScheduledOffDrivers.map((row) => row.roster_member_id)).toEqual(["a"]);
    expect(day.overrideOffRows.map((row) => row.roster_member_id)).toEqual(["b"]);
    expect(day.signal).toBe("NO_OPERATION");
  });

  it("groups trainees without counting them toward readiness", () => {
    const day = resolveManagerScheduleDay({
      serviceDate: "2026-08-08",
      routes: [route("1", "410")],
      rows: [
        { service_date: "2026-08-08", roster_member_id: "active", full_name: "Active Driver", worker_type: "Driver", employment_status: "Active", planned_on: true, route_name: "410", override_type: null },
        { service_date: "2026-08-08", roster_member_id: "trainee-on", full_name: "On-duty Trainee", worker_type: "Driver", employment_status: "Trainee", planned_on: true, route_name: null, override_type: null },
        { service_date: "2026-08-08", roster_member_id: "trainee-off", full_name: "Off-duty Trainee", worker_type: "Driver", employment_status: "Trainee", planned_on: false, route_name: null, override_type: "TIME_OFF" },
      ],
    });

    expect(day.scheduledDrivers).toBe(1);
    expect(day.capacityDelta).toBe(0);
    expect(day.signal).toBe("NO_CONTINGENCY");
    expect(day.traineeRows.map((row) => row.roster_member_id)).toEqual(["trainee-on", "trainee-off"]);
    expect(day.overrideOffRows).toEqual([]);
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
      roster: [
        { roster_member_id: "a", full_name: "A", worker_type: "Driver", employment_status: "Active" },
      ],
      baselines: [{
        id: "baseline-1",
        roster_member_id: "a",
        preset_id: "preset-1",
        rotation_mode: "NONE",
        anchor_date: "2026-08-08",
        effective_start: "2026-08-08",
        rotation_works_s: false,
        rotation_works_u: false,
        rotation_works_m: false,
        rotation_works_t: false,
        rotation_works_w: false,
        rotation_works_h: false,
        rotation_works_f: false,
        default_route_s: "410",
        default_route_u: null,
        default_route_m: "410",
        default_route_t: "410",
        default_route_w: "410",
        default_route_h: "410",
        default_route_f: null,
      }],
      presets: [{
        id: "preset-1",
        preset_code: "SUN-THU",
        works_s: false,
        works_u: true,
        works_m: true,
        works_t: true,
        works_w: true,
        works_h: true,
        works_f: false,
        uses_rotation: false,
      }],
    });
    expect(snapshot.days).toHaveLength(7);
    expect(snapshot.weekEnd).toBe("2026-08-14");
    expect(snapshot.pendingRequests.map((item) => item.id)).toEqual(["1"]);
    expect(snapshot.workbenchRows[0]).toMatchObject({
      fullName: "A",
      presetCode: "SUN-THU",
      schedulePending: false,
      defaultRoutes: ["410"],
    });
    expect(capacitySignal(2, 5, 3)).toBe("TARGET_RANGE");
    expect(capacitySignalLabel("TARGET_RANGE")).toBe("Target range");
  });
});
