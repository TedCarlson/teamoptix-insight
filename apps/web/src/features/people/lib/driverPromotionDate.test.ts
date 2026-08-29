import { describe, expect, it } from "vitest";
import { defaultDriverEffectiveDate, lastTraineeDate } from "./driverPromotionDate";

describe("defaultDriverEffectiveDate", () => {
  it("defaults the first driver day to today in Eastern time", () => {
    expect(defaultDriverEffectiveDate(new Date("2026-08-27T15:00:00Z"))).toBe("2026-08-27");
  });

  it("uses the Eastern date when UTC has already crossed midnight", () => {
    expect(defaultDriverEffectiveDate(new Date("2026-08-28T02:00:00Z"))).toBe("2026-08-27");
  });

  it("uses the new Eastern day after midnight", () => {
    expect(defaultDriverEffectiveDate(new Date("2026-09-01T05:00:00Z"))).toBe("2026-09-01");
  });
});

describe("lastTraineeDate", () => {
  it("closes trainee pay the day before the first Driver day", () => {
    expect(lastTraineeDate("2026-08-28")).toBe("2026-08-27");
  });

  it("crosses month boundaries", () => {
    expect(lastTraineeDate("2026-09-01")).toBe("2026-08-31");
  });

  it("rejects an invalid date", () => {
    expect(lastTraineeDate("not-a-date")).toBe("");
  });
});
