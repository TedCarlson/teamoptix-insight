import { describe, expect, it } from "vitest";
import { easternOperationalDayBounds } from "./operationalDay";

describe("easternOperationalDayBounds", () => {
  it("uses the winter UTC offset", () => {
    const result = easternOperationalDayBounds(new Date("2026-01-15T17:00:00Z"));
    expect(result.start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-01-16T05:00:00.000Z");
  });

  it("uses the summer UTC offset", () => {
    const result = easternOperationalDayBounds(new Date("2026-07-15T17:00:00Z"));
    expect(result.start.toISOString()).toBe("2026-07-15T04:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-07-16T04:00:00.000Z");
  });

  it("returns a 23-hour spring-forward day", () => {
    const result = easternOperationalDayBounds(new Date("2026-03-08T17:00:00Z"));
    expect(result.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("returns a 25-hour fall-back day", () => {
    const result = easternOperationalDayBounds(new Date("2026-11-01T17:00:00Z"));
    expect(result.start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
