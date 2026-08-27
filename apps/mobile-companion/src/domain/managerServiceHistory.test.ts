import {
  hasManagerHistoricalFccEvidence,
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
});
