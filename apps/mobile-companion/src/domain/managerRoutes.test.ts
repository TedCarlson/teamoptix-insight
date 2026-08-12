import { emptyManagerRouteDraft, validateManagerRouteDraft } from "./managerRoutes";

describe("manager route drafts", () => {
  it("requires a route name", () => {
    expect(validateManagerRouteDraft(emptyManagerRouteDraft())).toBe("Enter the route name.");
  });

  it("requires an operating day", () => {
    const draft = emptyManagerRouteDraft();
    draft.routeName = "410";
    draft.runs = { s: false, u: false, m: false, t: false, w: false, h: false, f: false };
    expect(validateManagerRouteDraft(draft)).toBe("Choose at least one operating day.");
  });

  it("validates numeric thresholds", () => {
    const draft = emptyManagerRouteDraft();
    draft.routeName = "410";
    draft.thresholdStops = "12.5";
    expect(validateManagerRouteDraft(draft)).toContain("whole number");
    draft.thresholdStops = "120";
    draft.thresholdRate = "-1";
    expect(validateManagerRouteDraft(draft)).toContain("rate");
  });

  it("accepts the governed route fields", () => {
    const draft = emptyManagerRouteDraft();
    draft.routeName = "410";
    draft.currentWaNumber = "WA410";
    draft.thresholdStops = "120";
    draft.thresholdRate = "1.25";
    expect(validateManagerRouteDraft(draft)).toBeNull();
  });
});
