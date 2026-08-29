import { describe, expect, it } from "vitest";
import { projectRosterUtilizationRows } from "./loadRosterUtilizationRows";

const fiveDayPreset = {
  id: "preset-5",
  preset_code: "MON_FRI",
  works_s: false,
  works_u: false,
  works_m: true,
  works_t: true,
  works_w: true,
  works_h: true,
  works_f: true,
};

const roster = (roster_member_id: string, worker_type: string) => ({
  roster_member_id,
  worker_type,
  full_name: roster_member_id,
  employment_status: "Active",
  hire_date: null,
});

describe("projectRosterUtilizationRows", () => {
  it("derives FT, PT, AVP, and schedule-needed from the baseline", () => {
    const rows = projectRosterUtilizationRows({
      rosterRows: [
        roster("ft", "Driver"),
        roster("pt", "Driver"),
        roster("avp", "AVP Driver"),
        roster("missing", "Driver"),
        roster("manager", "Manager"),
      ],
      baselineRows: [
        { id: "base-ft", roster_member_id: "ft", preset_id: "preset-5" },
        { id: "base-pt", roster_member_id: "pt", preset_id: "preset-4" },
        { id: "base-avp", roster_member_id: "avp", preset_id: "preset-4" },
      ],
      presetRows: [
        fiveDayPreset,
        { ...fiveDayPreset, id: "preset-4", preset_code: "MON_THU", works_f: false },
      ],
      fullTimeDayThreshold: 5,
    });

    expect(rows.map((row) => [
      row.roster_member_id,
      row.driver_program,
      row.driver_utilization_category,
      row.route_utilization_ratio,
    ])).toEqual([
      ["ft", "STANDARD", "FULL_TIME", 1],
      ["pt", "STANDARD", "PART_TIME", 0.8],
      ["avp", "AVP", "PART_TIME", 0.8],
      ["missing", "STANDARD", "UNSCHEDULED", 0],
      ["manager", null, null, null],
    ]);
  });

  it("honors a configured four-day full-time threshold", () => {
    const [row] = projectRosterUtilizationRows({
      rosterRows: [roster("driver", "Driver")],
      baselineRows: [
        { id: "base", roster_member_id: "driver", preset_id: "preset-4" },
      ],
      presetRows: [
        { ...fiveDayPreset, id: "preset-4", preset_code: "MON_THU", works_f: false },
      ],
      fullTimeDayThreshold: 4,
    });

    expect(row.driver_utilization_category).toBe("FULL_TIME");
    expect(row.driver_full_time_day_threshold).toBe(4);
  });
});
