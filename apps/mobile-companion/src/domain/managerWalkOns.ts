export type ManagerWalkOnStatus = "ACTIVE" | "ARCHIVED";

export type ManagerWalkOnRecordMode = "EXISTING" | "NEW" | "CANDIDATE";

export type ManagerWalkOnWorkforceUnit = {
  id: string;
  name: string;
};

export type ManagerWalkOnAssignment = {
  id: string;
  rosterMemberId: string;
  serviceDate: string;
  status: "ACTIVE" | "REVERSED";
  note: string | null;
  payrollEventId: string | null;
  payrollEventStatus: string | null;
  payTreatment: "ROSTER_RATE" | "ONE_DAY_RATE" | "INTERCOMPANY" | null;
  overrideDailyPayRate: number | null;
};

export type ManagerWalkOnPerson = {
  id: string;
  rosterMemberId: string;
  fullName: string;
  dswid: string | null;
  workforceUnitId: string | null;
  workforceUnitName: string | null;
  firstSeenDate: string;
  lastSeenDate: string;
  dispatchCount: number;
  status: ManagerWalkOnStatus;
  assignments: ManagerWalkOnAssignment[];
};

export type ManagerWalkOnSnapshot = {
  serviceDate: string;
  people: ManagerWalkOnPerson[];
  workforceUnits: ManagerWalkOnWorkforceUnit[];
};

export type ManagerWalkOnAssignmentDraft = {
  mode: ManagerWalkOnRecordMode;
  rosterMemberId: string | null;
  fullName: string;
  dswid: string;
  workforceUnitId: string | null;
  newWorkforceUnitName: string;
  serviceDate: string;
  note: string;
};

export type ManagerWalkOnIdentityDraft = {
  rosterMemberId: string;
  fullName: string;
  dswid: string;
  workforceUnitId: string | null;
  status: ManagerWalkOnStatus;
};

export type ManagerWalkOnSaveResult = {
  recordMode: "WALK_ON" | "CANDIDATE";
  rosterMemberId: string;
  fullName: string;
  serviceDate: string;
  workforceUnitId: string | null;
};

export function validateManagerWalkOnAssignment(draft: ManagerWalkOnAssignmentDraft) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.serviceDate)) return "Choose a valid service date.";
  if (draft.mode === "EXISTING" && !draft.rosterMemberId) return "Choose an existing walk-on.";
  if (draft.mode !== "EXISTING" && !draft.fullName.trim()) return "Enter the person’s full name.";
  if (draft.mode === "NEW" && !draft.dswid.trim()) return "Enter the foreign DSWID.";
  if (draft.mode !== "CANDIDATE" && !draft.workforceUnitId && !draft.newWorkforceUnitName.trim()) {
    return "Choose or add the lending workforce unit.";
  }
  return null;
}

export function validateManagerWalkOnIdentity(draft: ManagerWalkOnIdentityDraft) {
  if (!draft.rosterMemberId) return "The walk-on identity is unavailable.";
  if (!draft.fullName.trim()) return "Enter the person’s full name.";
  if (!draft.dswid.trim()) return "Enter the foreign DSWID.";
  if (!draft.workforceUnitId) return "Choose the lending workforce unit.";
  return null;
}
