import { describe, expect, it } from "vitest";
import { buildHistoricalServiceRoutes } from "./historicalServiceRoutes";

describe("historical Service route authority", () => {
  it("renders the selected day's production routes instead of today's route list", () => {
    const result = buildHistoricalServiceRoutes({
      configuredRoutes: [
        {
          id: "today-426",
          route_name: "BPV 03",
          current_wa_num: "426",
          route_location: null,
          route_type: null,
          runs_s: true,
          runs_u: true,
          runs_m: true,
          runs_t: true,
          runs_w: true,
          runs_h: true,
          runs_f: true,
        },
      ],
      dswRows: [
        {
          route_name: "Peak BPV 25",
          wa_number: "447",
          driver_name: "KIMBLE, IZALE",
        },
      ],
      droRows: [{ route_name: "BPV 08", wa_number: "453" }],
      fccRows: [{ wa_number_normalized: "430" }],
      manifestRoutes: [{ route_key: "445", route_label: "BPV 06" }],
    });

    expect([...result.routes.keys()]).toEqual(["447", "453", "430", "445"]);
    expect(result.routes.get("447")?.driver?.full_name).toBe("KIMBLE, IZALE");
    expect(result.routes.has("426")).toBe(false);
  });

  it("can seed today's planned lineup before merging every observed source", () => {
    const configured = {
      id: "426",
      route_name: "BPV 03",
      current_wa_num: "426",
      route_location: null,
      route_type: null,
      runs_s: true,
      runs_u: true,
      runs_m: true,
      runs_t: true,
      runs_w: true,
      runs_h: true,
      runs_f: true,
    };
    const result = buildHistoricalServiceRoutes({
      configuredRoutes: [configured],
      baseRoutes: [configured],
      dswRows: [],
      droRows: [{ route_name: "Peak BPV 25", wa_number: "447" }],
      fccRows: [],
      manifestRoutes: [],
    });

    expect([...result.routes.keys()]).toEqual(["426", "447"]);
  });

  it("uses the configured BPV name when FINAL DSW only supplies a generic WA label", () => {
    const result = buildHistoricalServiceRoutes({
      configuredRoutes: [
        {
          id: "route-426",
          route_name: "BPV 03",
          current_wa_num: "426",
          route_location: null,
          route_type: null,
          runs_s: true,
          runs_u: true,
          runs_m: true,
          runs_t: true,
          runs_w: true,
          runs_h: true,
          runs_f: true,
        },
      ],
      dswRows: [{ wa_number: "426", route_name: "WA 426" }],
      fccRows: [],
      manifestRoutes: [],
    });

    expect(result.routes.get("426")?.route_name).toBe("BPV 03");
  });
});
