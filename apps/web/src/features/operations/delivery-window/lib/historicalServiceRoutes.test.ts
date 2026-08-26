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
      fccRows: [{ wa_number_normalized: "430" }],
      manifestRoutes: [{ route_key: "445", route_label: "BPV 06" }],
    });

    expect([...result.routes.keys()]).toEqual(["447", "430", "445"]);
    expect(result.routes.get("447")?.driver?.full_name).toBe("KIMBLE, IZALE");
    expect(result.routes.has("426")).toBe(false);
  });
});
