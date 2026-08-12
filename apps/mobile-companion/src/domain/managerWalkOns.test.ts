import {
  validateManagerWalkOnAssignment,
  validateManagerWalkOnIdentity,
  type ManagerWalkOnAssignmentDraft,
} from "./managerWalkOns";

const base: ManagerWalkOnAssignmentDraft = {
  mode: "NEW",
  rosterMemberId: null,
  fullName: "Jaylen Hearns",
  dswid: "HEARNS,JAYLEN",
  workforceUnitId: "unit-1",
  newWorkforceUnitName: "",
  serviceDate: "2026-08-12",
  note: "",
};

describe("manager walk-on workflow", () => {
  it("accepts a complete reusable walk-on", () => {
    expect(validateManagerWalkOnAssignment(base)).toBeNull();
  });

  it("requires an existing identity when reusing a walk-on", () => {
    expect(validateManagerWalkOnAssignment({ ...base, mode: "EXISTING", rosterMemberId: null }))
      .toBe("Choose an existing walk-on.");
  });

  it("allows candidate creation without DSWID or workforce unit", () => {
    expect(validateManagerWalkOnAssignment({
      ...base,
      mode: "CANDIDATE",
      dswid: "",
      workforceUnitId: null,
    })).toBeNull();
  });

  it("requires a governed workforce unit for reusable identities", () => {
    expect(validateManagerWalkOnAssignment({
      ...base,
      workforceUnitId: null,
      newWorkforceUnitName: "",
    })).toBe("Choose or add the lending workforce unit.");
  });

  it("requires complete identity fields for management", () => {
    expect(validateManagerWalkOnIdentity({
      rosterMemberId: "roster-1",
      fullName: "Jaylen Hearns",
      dswid: "",
      workforceUnitId: "unit-1",
      status: "ACTIVE",
    })).toBe("Enter the foreign DSWID.");
  });
});

