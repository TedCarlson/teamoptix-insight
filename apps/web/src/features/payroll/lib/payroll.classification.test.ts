import { describe, expect, it } from "vitest";
import { payrollSummaryGroup } from "@/features/payroll/lib/payroll.classification";
import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";
import type { RosterRow } from "@/features/people/types/roster.types";

const walkOnRoster = {
  roster_member_id: "walk-on-1",
  roster_record_kind: "WALK_ON",
  full_name: "Jaylin Virgil Herns",
  email: null,
  phone: null,
  worker_type: "Driver",
  employment_status: "Support",
  market_code: null,
  reports_to_name: null,
  hire_date: null,
  invite_status: "Not Invited",
  compliance_signals: [],
} satisfies RosterRow;

const summaryRow = {
  roster_member_id: walkOnRoster.roster_member_id,
  person_name: walkOnRoster.full_name,
  days_worked: 1,
  worked_days: ["2026-08-07"],
  worked_day_kinds: { "2026-08-07": "WALK_ON" },
  daily_pay_total: 0,
  threshold_pay_total: 0,
  estimated_total: 0,
} satisfies PayrollSummaryRow;

describe("payroll summary classification", () => {
  it("groups walk-on support rows separately from former drivers", () => {
    const roster = new Map([[walkOnRoster.roster_member_id, walkOnRoster]]);

    expect(payrollSummaryGroup(summaryRow, roster)).toBe("Walk-ons · Support");
  });

  it("uses walk-on day evidence when the roster lookup is unavailable", () => {
    expect(payrollSummaryGroup(summaryRow, new Map())).toBe("Walk-ons · Support");
  });
});
