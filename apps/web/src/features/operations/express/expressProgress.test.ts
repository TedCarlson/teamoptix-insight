import { describe, expect, it } from "vitest";
import { normalizeExpressProgress } from "./expressProgress";

describe("normalizeExpressProgress", () => {
  it("derives total from exclusive Complete, Attempted, and Open states", () => {
    expect(
      normalizeExpressProgress({ total: 999, complete: 55, attempted: 43, open: 346 })
    ).toEqual({ total: 444, complete: 55, attempted: 43, open: 346 });
  });

  it("never allows negative or non-finite state counts", () => {
    expect(
      normalizeExpressProgress({ complete: -1, attempted: Number.NaN, open: 4 })
    ).toEqual({ total: 4, complete: 0, attempted: 0, open: 4 });
  });
});
