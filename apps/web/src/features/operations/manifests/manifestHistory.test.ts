import { describe, expect, it } from "vitest";
import {
  fccRouteIdentity,
  fccSummarySignalCount,
  findFccRouteSummary,
  isManifestDetailDate,
  isManifestHistoryDate,
  manifestHistoryWindow,
  normalizeManifestRouteKey,
  preferFccRouteSummary,
} from "./manifestHistory";

describe("manifest delivery history", () => {
  const now = new Date("2026-08-25T16:00:00.000Z");

  it("keeps seven-day detail inside a 366-day evidence window", () => {
    expect(manifestHistoryWindow(now)).toEqual({
      minimum: "2025-08-24",
      maximum: "2026-08-25",
      detail_minimum: "2026-08-18",
    });
    expect(isManifestDetailDate("2026-08-18", now)).toBe(true);
    expect(isManifestDetailDate("2026-08-17", now)).toBe(false);
    expect(isManifestHistoryDate("2026-08-18", now)).toBe(true);
    expect(isManifestHistoryDate("2026-08-25", now)).toBe(true);
    expect(isManifestHistoryDate("2025-08-24", now)).toBe(true);
    expect(isManifestHistoryDate("2025-08-23", now)).toBe(false);
    expect(isManifestHistoryDate("2026-08-26", now)).toBe(false);
  });

  it("matches manifest route keys to the FCC work-area summary", () => {
    const row = {
      source_route_key: "WA 0042",
      source_wa_number: "0042",
      normalized_row_json: { wa_number_normalized: "42" },
    };
    expect(findFccRouteSummary([row], "42")).toBe(row);
    expect(normalizeManifestRouteKey("WA #0042")).toBe("42");
  });

  it("derives the daily route inventory from FCC route identity", () => {
    const row = {
      source_route_key: "North",
      source_wa_number: "0042",
      normalized_row_json: {
        wa_number_normalized: "42",
        last_delivery_time: "17:14:02",
        last_delivery_address: "123 Main St",
      },
    };

    expect(fccRouteIdentity(row)).toEqual({
      routeKey: "42",
      routeLabel: "WA 42",
    });
    expect(fccSummarySignalCount(row)).toBe(2);
  });

  it("uses the latest FCC delivery timestamp when a route has multiple rows", () => {
    const earlier = {
      source_wa_number: "0447",
      normalized_row_json: {
        driver_name: "MAUTE,CHRIS",
        last_delivery_time: "18:58:56",
        last_transmission_time: "18:59",
        deliveries_complete: true,
      },
    };
    const later = {
      source_wa_number: "0447",
      normalized_row_json: {
        driver_name: "KIMBLE,IZALE JEREMY",
        last_delivery_time: "18:59:15",
        last_transmission_time: "18:59",
      },
    };

    expect(preferFccRouteSummary(later, earlier)).toBe(true);
    expect(preferFccRouteSummary(earlier, later)).toBe(false);
  });
});
