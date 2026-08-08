import { describe, expect, it } from "vitest";
import {
  buildPayrollDriverDayDetails,
  buildPayrollSummaryFromDriverDayDetails,
} from "@/features/payroll/lib/payroll.detail";
import type { PayrollActivityRow } from "@/features/payroll/lib/payroll.types";

function activity(
  overrides: Partial<PayrollActivityRow>
): PayrollActivityRow {
  return {
    service_date: "2026-07-21",
    roster_member_id: "roster-1",
    person_name: "Alex Trainee",
    attendance_status: "present",
    source_kind: "MANUAL_TRAINING",
    daily_pay_rate: 125,
    daily_pay_eligible: true,
    threshold_stops: 0,
    threshold_rate: 0,
    threshold_overage: 0,
    threshold_pay_amount: 0,
    review_flags: [],
    metadata_json: {
      event_source: "MANUAL",
      fallback_only: true,
    },
    ...overrides,
  };
}

describe("payroll fallback work evidence", () => {
  it("creates a payable training day without route productivity", () => {
    const details = buildPayrollDriverDayDetails([activity({})]);

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      person_name: "Alex Trainee",
      daily_pay_applied: 125,
      threshold_pay_amount: 0,
      total_stops: 0,
      route_collection_label: "Training day · fallback work evidence",
    });
    expect(details[0].flags).toContain("FALLBACK_WORK_EVENT");
    expect(details[0].flags).not.toContain("MISSING_THRESHOLD");

    const summary = buildPayrollSummaryFromDriverDayDetails(details);
    expect(summary).toEqual([
      expect.objectContaining({
        days_worked: 1,
        daily_pay_total: 125,
        threshold_pay_total: 0,
        estimated_total: 125,
      }),
    ]);
  });

  it("uses the helper label for dispatch helper evidence", () => {
    const details = buildPayrollDriverDayDetails([
      activity({
        person_name: "Jamie Helper",
        source_kind: "DISPATCH_HELPER",
        daily_pay_rate: 90,
        metadata_json: {
          event_source: "DISPATCH",
          fallback_only: true,
        },
      }),
    ]);

    expect(details[0].route_collection_label).toBe(
      "Helper day · fallback work evidence"
    );
    expect(details[0].estimated_total).toBe(90);
  });

  it("keeps a walk-on override tied to DSW production and its one-day rate", () => {
    const details = buildPayrollDriverDayDetails([
      activity({
        person_name: "Jaylin Virgil Herns",
        source_kind: "DSW_OWNERSHIP",
        daily_pay_rate: 175,
        metadata_json: {
          walk_on_payroll_event_id: "walk-on-event-1",
          walk_on_pay_treatment: "ONE_DAY_RATE",
        },
      }),
    ]);

    expect(details[0]).toMatchObject({
      person_name: "Jaylin Virgil Herns",
      work_day_kind: "WALK_ON",
      daily_pay_applied: 175,
      estimated_total: 175,
    });
    expect(details[0].flags).not.toContain("FALLBACK_WORK_EVENT");
  });

  it("keeps an unresolved walk-on day visible at zero pay for override review", () => {
    const details = buildPayrollDriverDayDetails([
      activity({
        person_name: "Jaylin Virgil Herns",
        source_kind: "DSW_OWNERSHIP",
        daily_pay_rate: null,
        daily_pay_eligible: false,
        review_flags: ["WALK_ON_PAY_OVERRIDE_REQUIRED"],
        metadata_json: {
          walk_on_assignment_id: "walk-on-assignment-1",
          walk_on_pay_override_required: true,
        },
      }),
    ]);

    expect(details[0]).toMatchObject({
      work_day_kind: "WALK_ON",
      daily_pay_rate: null,
      daily_pay_applied: 0,
      estimated_total: 0,
    });
    expect(details[0].flags).toContain("WALK_ON_PAY_OVERRIDE_REQUIRED");
  });

  it("labels a manual walk-on event when DSW production is not loaded yet", () => {
    const details = buildPayrollDriverDayDetails([
      activity({
        person_name: "Jaylin Virgil Herns",
        source_kind: "MANUAL_WALK_ON",
        daily_pay_rate: 175,
      }),
    ]);

    expect(details[0].route_collection_label).toBe(
      "Walk-on day · fallback work evidence"
    );
    expect(details[0].work_day_kind).toBe("WALK_ON");
  });

  it("continues to exclude unrelated attendance-only activity", () => {
    const details = buildPayrollDriverDayDetails([
      activity({ source_kind: "ATTENDANCE_ONLY" }),
    ]);

    expect(details).toEqual([]);
  });
});
