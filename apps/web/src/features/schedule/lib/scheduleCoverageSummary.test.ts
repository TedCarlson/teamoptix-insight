import { describe, expect, it } from "vitest";
import { summarizeScheduleCoverage } from "./scheduleCoverageSummary";

describe("summarizeScheduleCoverage", () => {
  it("measures route-days covered and keeps AVP as a coverage program", () => {
    const summary = summarizeScheduleCoverage({
      startDate: "2026-08-22",
      endDate: "2026-08-23",
      routes: [{
        id: "route-1", route_name: "Route 1", current_wa_num: "WA-1",
        runs_s: true, runs_u: true, runs_m: false, runs_t: false,
        runs_w: false, runs_h: false, runs_f: false,
      }],
      scheduleRows: [
        {
          service_date: "2026-08-22", roster_member_id: "standard",
          full_name: "Standard Driver", worker_type: "Driver",
          employment_status: "Active", planned_on: true, route_name: "WA-1",
        },
        {
          service_date: "2026-08-23", roster_member_id: "avp",
          full_name: "AVP Driver", worker_type: "AVP Driver",
          employment_status: "Active", planned_on: true, route_name: "Route 1",
        },
      ],
    });

    expect(summary.demandRouteDays).toBe(2);
    expect(summary.coveredRouteDays).toBe(2);
    expect(summary.coveragePercent).toBe(100);
    expect(summary.coveredByProgram).toEqual({ STANDARD: 1, AVP: 1 });
  });

  it("reports uncovered and non-driver assignment seams", () => {
    const summary = summarizeScheduleCoverage({
      startDate: "2026-08-22",
      endDate: "2026-08-22",
      routes: [{
        id: "route-1", route_name: "Route 1", current_wa_num: "WA-1",
        runs_s: true, runs_u: false, runs_m: false, runs_t: false,
        runs_w: false, runs_h: false, runs_f: false,
      }],
      scheduleRows: [{
        service_date: "2026-08-22", roster_member_id: "helper",
        full_name: "Helper", worker_type: "Jumper / Helper",
        employment_status: "Active", planned_on: true, route_name: "WA-1",
      }],
    });

    expect(summary.openRouteDays).toBe(1);
    expect(summary.seams.map((seam) => seam.type)).toEqual([
      "UNCOVERED_ROUTE",
      "NON_DRIVER_ROUTE_ASSIGNMENT",
    ]);
  });
});
