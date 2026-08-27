import {
  hasManagerHistoricalFccEvidence,
  managerHistoricalFccPhase,
  managerServiceRouteIdentity,
  resolveManagerServiceDate,
} from "./managerServiceHistory";

describe("manager Service history", () => {
  it("accepts a valid past date and rejects future or malformed dates", () => {
    expect(resolveManagerServiceDate("2026-08-20", "2026-08-27")).toBe("2026-08-20");
    expect(resolveManagerServiceDate("2026-08-28", "2026-08-27")).toBe("2026-08-27");
    expect(resolveManagerServiceDate("August 20", "2026-08-27")).toBe("2026-08-27");
  });

  it("excludes empty FCC shells while retaining real selected-day evidence", () => {
    expect(hasManagerHistoricalFccEvidence({})).toBe(false);
    expect(hasManagerHistoricalFccEvidence({ last_delivery_time: "  " })).toBe(false);
    expect(hasManagerHistoricalFccEvidence({ deliveries_complete: true })).toBe(true);
    expect(hasManagerHistoricalFccEvidence({ last_transmission_time: "2026-08-20T20:10:00Z" })).toBe(true);
  });

  it("matches padded FCC work areas to configured and manifest route keys", () => {
    expect(managerServiceRouteIdentity("0426")).toBe("426");
    expect(managerServiceRouteIdentity("WA 00426")).toBe("426");
    expect(managerServiceRouteIdentity("BPV 01")).toBe("bpv01");
  });

  it("uses FCC activity as historical phase evidence", () => {
    expect(managerHistoricalFccPhase({ last_delivery_time: "19:20:02" })).toBe("on_job");
    expect(managerHistoricalFccPhase({ final_stop_time: "19:41:14" })).toBe("end_of_day");
    expect(managerHistoricalFccPhase({ deliveries_complete: true, pickup_complete: true })).toBe("end_of_day");
    expect(managerHistoricalFccPhase({})).toBeNull();
  });
});
