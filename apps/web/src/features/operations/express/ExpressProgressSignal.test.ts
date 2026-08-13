import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpressProgressSignal } from "./ExpressProgressSignal";

describe("ExpressProgressSignal", () => {
  it("keeps the complete, attempted, and open evidence contract on delivery surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpressProgressSignal, {
        progress: { total: 10, complete: 4, attempted: 2, open: 4 },
      })
    );

    expect(markup).toContain("Complete");
    expect(markup).toContain("Attempted");
    expect(markup).toContain("Open");
    expect(markup).toContain("background:#f5f3ff");
    expect(markup).toContain("background:#fff7ed");
  });

  it("shows only populated states for dispatch posture", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpressProgressSignal, {
        progress: { total: 12, complete: 0, attempted: 0, open: 12 },
        hideZeroSegments: true,
      })
    );

    expect(markup).not.toContain(">Complete<");
    expect(markup).not.toContain(">Attempted<");
    expect(markup).toContain(">Open<");
  });

  it("does not present zero totals as evidence when matching is unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpressProgressSignal, {
        progress: { total: 0, complete: 0, attempted: 0, open: 0 },
        dataHealth: { referenceMatchAvailable: false },
        hideZeroSegments: true,
      })
    );

    expect(markup).toContain("No Express volume in manifests");
    expect(markup).toContain("All Codes status matching unavailable");
  });

  it("retains the total when a populated signal has a data-health warning", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpressProgressSignal, {
        progress: { total: 444, complete: 167, attempted: 5, open: 272 },
        dataHealth: { referenceMatchAvailable: false },
        hideZeroSegments: true,
      })
    );

    expect(markup).toContain("444 total");
    expect(markup).toContain("All Codes status matching unavailable");
    expect(markup).not.toContain(">Evidence unavailable<");
  });
});
