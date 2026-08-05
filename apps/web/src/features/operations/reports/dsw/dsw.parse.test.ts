import { describe, expect, it } from "vitest";
import { toEarlyLatePickups } from "./dsw.parse";

describe("toEarlyLatePickups", () => {
  it.each([
    ["0/1", 0, 1, 1],
    ["2/0", 2, 0, 2],
    ["0/0", 0, 0, 0],
    [" 3 / 4 ", 3, 4, 7],
  ])(
    "splits %s into early and late counts",
    (value, early, late, total) => {
      expect(toEarlyLatePickups(value)).toMatchObject({
        early,
        late,
        total,
        valid: true,
      });
    }
  );

  it("treats an empty DSW cell as an observed zero", () => {
    expect(toEarlyLatePickups("")).toEqual({
      raw: null,
      early: 0,
      late: 0,
      total: 0,
      valid: true,
    });
  });

  it("does not reinterpret malformed source values", () => {
    expect(toEarlyLatePickups("1")).toEqual({
      raw: "1",
      early: null,
      late: null,
      total: null,
      valid: false,
    });
  });
});
