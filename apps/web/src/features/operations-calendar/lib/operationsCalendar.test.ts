import { describe, expect, it } from "vitest";
import {
  activeDispatchEvents,
  operatingContextForEvents,
  operationsMonthDays,
  projectHolidayWorkforce,
  scheduledWorkforceCount,
  startOfOperationsWeek,
  updateBlackoutSelection,
} from "./operationsCalendar";
import type { DispatchEventRow } from "@/features/dispatch/lib/dispatchSupport";

function event(
  id: string,
  eventCode: string,
  createdAt: string,
  payload: Record<string, unknown> = {}
): DispatchEventRow {
  return {
    id,
    event_code: eventCode,
    event_label: eventCode,
    event_category: "OPERATIONS",
    route_key: null,
    route_label: null,
    from_route_key: null,
    from_route_label: null,
    to_route_key: null,
    to_route_label: null,
    seat: null,
    person_roster_member_id: null,
    person_name: null,
    note: null,
    event_payload: payload,
    created_at: createdAt,
  };
}

describe("operations calendar", () => {
  it("starts operating weeks on Saturday", () => {
    const monday = new Date(2026, 8, 7, 12);
    expect(startOfOperationsWeek(monday).getDay()).toBe(6);
    expect(startOfOperationsWeek(monday).getDate()).toBe(5);
  });

  it("builds a Saturday-first six-week month", () => {
    const days = operationsMonthDays(new Date(2026, 8, 1, 12));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(6);
    expect(days[0].getDate()).toBe(29);
    expect(days[41].getDay()).toBe(5);
  });

  it("resolves the active context after ledger reversals", () => {
    const closed = event("closed", "OPERATIONS_CLOSED", "2026-09-01T12:00:00Z");
    const undo = event("undo", "UNDO_OPERATIONS_CLOSED", "2026-09-01T13:00:00Z", {
      reverses_event_id: "closed",
    });
    const peak = event("peak", "OPERATIONS_PEAK", "2026-09-01T14:00:00Z");

    expect(activeDispatchEvents([closed, undo, peak]).map((row) => row.id)).toEqual([
      "peak",
    ]);
    expect(operatingContextForEvents([closed, undo, peak])).toBe("PEAK");
  });

  it("projects every scheduled role off for a holiday", () => {
    const rows = [
      {
        id: "driver",
        service_date: "2026-09-07",
        roster_member_id: "driver",
        full_name: "Driver One",
        worker_type: "Driver",
        planned_on: true,
        route_name: "Route 1",
        source_kind: "BASELINE",
        override_type: null,
      },
      {
        id: "trainee",
        service_date: "2026-09-07",
        roster_member_id: "trainee",
        full_name: "Trainee One",
        worker_type: "Trainee",
        planned_on: true,
        route_name: "Route 1",
        source_kind: "BASELINE",
        override_type: null,
      },
    ];

    expect(scheduledWorkforceCount(rows)).toBe(2);
    const projected = projectHolidayWorkforce(rows);
    expect(scheduledWorkforceCount(projected)).toBe(0);
    expect(projected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ planned_on: false, override_type: "HOLIDAY" }),
      ])
    );
  });

  it("toggles individual blackout dates without implying a range", () => {
    const selected = updateBlackoutSelection({
      dates: ["2026-11-28"],
      clickedDate: "2026-11-30",
      mode: "INDIVIDUAL",
      rangeAnchor: null,
    });
    expect(selected).toEqual({
      dates: ["2026-11-28", "2026-11-30"],
      rangeAnchor: null,
    });

    expect(
      updateBlackoutSelection({
        dates: selected.dates,
        clickedDate: "2026-11-28",
        mode: "INDIVIDUAL",
        rangeAnchor: null,
      }).dates
    ).toEqual(["2026-11-30"]);
  });

  it("uses two stable clicks to select an inclusive blackout range", () => {
    const firstClick = updateBlackoutSelection({
      dates: [],
      clickedDate: "2026-11-30",
      mode: "RANGE",
      rangeAnchor: null,
    });
    expect(firstClick).toEqual({
      dates: ["2026-11-30"],
      rangeAnchor: "2026-11-30",
    });

    expect(
      updateBlackoutSelection({
        dates: firstClick.dates,
        clickedDate: "2026-11-28",
        mode: "RANGE",
        rangeAnchor: firstClick.rangeAnchor,
      })
    ).toEqual({
      dates: ["2026-11-28", "2026-11-29", "2026-11-30"],
      rangeAnchor: null,
    });
  });
});
