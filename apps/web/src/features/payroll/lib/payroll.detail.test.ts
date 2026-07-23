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

  it("continues to exclude unrelated attendance-only activity", () => {
    const details = buildPayrollDriverDayDetails([
      activity({ source_kind: "ATTENDANCE_ONLY" }),
    ]);

    expect(details).toEqual([]);
  });
});
