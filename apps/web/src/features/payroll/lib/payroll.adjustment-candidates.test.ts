import { describe, expect, it } from "vitest";
import type { RosterRow } from "@/features/people/types/roster.types";
import { buildPayrollAdjustmentCandidates } from "./payroll.adjustment-candidates";

function rosterRow(overrides: Partial<RosterRow>): RosterRow {
  return {
    roster_member_id: "roster-1",
    roster_record_kind: "INTERNAL",
    full_name: "Active Driver",
    email: null,
    phone: null,
    worker_type: "Driver",
    employment_status: "Active",
    market_code: null,
    reports_to_name: null,
    hire_date: null,
    invite_status: "Not Invited",
    compliance_signals: [],
    ...overrides,
  };
}

describe("targeted payroll adjustment candidates", () => {
  it("includes a support walk-on only when the selected week has payroll activity", () => {
    const walkOn = rosterRow({
      roster_member_id: "walk-on-1",
      roster_record_kind: "WALK_ON",
      full_name: "Jaylen Hearns",
      employment_status: "Support",
    });

    expect(buildPayrollAdjustmentCandidates([walkOn], [])).toEqual([]);
    expect(
      buildPayrollAdjustmentCandidates([walkOn], ["walk-on-1"]).map(
        (row) => row.full_name
      )
    ).toEqual(["Jaylen Hearns"]);
  });

  it("keeps current active and trainee people available", () => {
    const rows = [
      rosterRow({ roster_member_id: "active", full_name: "Alex Active" }),
      rosterRow({
        roster_member_id: "trainee",
        full_name: "Taylor Trainee",
        employment_status: "Trainee",
      }),
    ];

    expect(
      buildPayrollAdjustmentCandidates(rows, []).map((row) => row.full_name)
    ).toEqual(["Alex Active", "Taylor Trainee"]);
  });

  it("includes a former worker only for a week containing payroll activity", () => {
    const former = rosterRow({
      roster_member_id: "former",
      full_name: "Frank Former",
      employment_status: "Former",
    });

    expect(buildPayrollAdjustmentCandidates([former], [])).toEqual([]);
    expect(buildPayrollAdjustmentCandidates([former], ["former"])).toHaveLength(1);
  });
});
