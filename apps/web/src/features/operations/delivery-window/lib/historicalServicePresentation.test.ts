import { describe, expect, it } from "vitest";
import {
  hasHistoricalFccEvidence,
  historicalRouteEvidenceLabel,
  historicalRouteSignal,
  historicalServiceSummary,
} from "./historicalServicePresentation";

describe("historical Service presentation authority", () => {
  it("uses the selected-day final DSW contract totals when route rows are unavailable", () => {
    const summary = historicalServiceSummary(
      {
        rows: [
          {
            summary_scope: "CONTRACT",
            normalized_row_json: {
              vscan_packages: 2500,
              actual_delivery_packages: 2373,
              planned_delivery_stops: 1665,
              actual_delivery_stops: 1613,
              planned_pickup_stops: 67,
              actual_pickup_stops: 63,
            },
          },
        ],
      },
      23
    );

    expect(summary).toEqual({
      reportedRoutes: 23,
      plannedPackages: 2500,
      actualPackages: 2373,
      plannedStops: 1665,
      actualStops: 1613,
      plannedPickupStops: 67,
      actualPickupStops: 63,
      completion: 97,
    });
  });

  it("describes retained historical evidence without an in-day login claim", () => {
    const input = {
      hasDsw: false,
      hasFcc: true,
      hasManifest: false,
      hasDispatchAssignment: true,
    };

    expect(historicalRouteSignal(input).label).toBe("FCC route record");
    expect(historicalRouteSignal(input).label).not.toMatch(/login/i);
    expect(historicalRouteEvidenceLabel(input)).toBe("FCC");
  });

  it("does not count an empty FCC route shell as reported production", () => {
    expect(hasHistoricalFccEvidence({})).toBe(false);
    expect(
      hasHistoricalFccEvidence({
        last_transmission_time: "19:33:02",
        last_delivery_time: "18:58:56",
      })
    ).toBe(true);
  });
});
