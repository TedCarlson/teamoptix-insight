export type ManagerPeopleComplianceStatus = "warning" | "urgent" | "expired" | "missing";

export type ManagerPeopleComplianceSignal = {
  key: "driver_license" | "dot_medical" | "qualification_certificate";
  label: string;
  status: ManagerPeopleComplianceStatus;
  expirationDate: string | null;
  daysRemaining: number | null;
};

export type ManagerPerson = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  workerType: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  marketCode: string | null;
  reportsToName: string | null;
  hireDate: string | null;
  separationDate: string | null;
  inviteStatus: string;
  rosterRecordKind: string;
  fxId: string | null;
  dswid: string | null;
  candidateStageKey: string | null;
  candidateStageLabel: string | null;
  candidateStageTerminal: boolean;
  candidateProgress: number;
  requiredChecklistComplete: number;
  requiredChecklistTotal: number;
  complianceSignals: ManagerPeopleComplianceSignal[];
};

export type ManagerCandidateStage = {
  key: string;
  label: string;
  isTerminal: boolean;
  sortOrder: number;
};

export type ManagerPeopleInterview = {
  id: string;
  personName: string;
  startsAt: string | null;
  status: string;
  provider: string | null;
};

export type ManagerPeopleSnapshot = {
  serviceDate: string;
  timeZone: string;
  canViewRoster: boolean;
  canManageHiring: boolean;
  scheduledToday: number;
  offToday: number;
  timeAwayToday: number;
  interviewsToday: number;
  people: ManagerPerson[];
  stages: ManagerCandidateStage[];
  interviews: ManagerPeopleInterview[];
};

const DAY_MS = 86_400_000;

function utcDay(value: Date | string) {
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function complianceSignal(
  key: ManagerPeopleComplianceSignal["key"],
  label: string,
  expirationDate: string | null | undefined,
  asOf: Date,
): ManagerPeopleComplianceSignal | null {
  if (!expirationDate) return { key, label, status: "missing", expirationDate: null, daysRemaining: null };
  const parsed = new Date(`${expirationDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) {
    return { key, label, status: "missing", expirationDate: null, daysRemaining: null };
  }
  const daysRemaining = Math.round((utcDay(parsed) - utcDay(asOf)) / DAY_MS);
  if (daysRemaining >= 61) return null;
  if (daysRemaining < 0) return { key, label, status: "expired", expirationDate, daysRemaining };
  if (daysRemaining <= 30) return { key, label, status: "urgent", expirationDate, daysRemaining };
  return { key, label, status: "warning", expirationDate, daysRemaining };
}

export function deriveManagerPeopleCompliance(
  facts: {
    licenseExpirationDate?: string | null;
    dotExpirationDate?: string | null;
    qualificationExpirationDate?: string | null;
  },
  asOf: Date = new Date(),
) {
  return [
    complianceSignal("driver_license", "Driver License", facts.licenseExpirationDate, asOf),
    complianceSignal("dot_medical", "DOT Medical Card", facts.dotExpirationDate, asOf),
    complianceSignal("qualification_certificate", "Qualification Certificate", facts.qualificationExpirationDate, asOf),
  ].filter((signal): signal is ManagerPeopleComplianceSignal => signal !== null);
}

export function validateCandidateStageChange(input: {
  person: ManagerPerson | null;
  stageKey: string;
  stages: ManagerCandidateStage[];
}) {
  if (!input.person || input.person.employmentStatus !== "Candidate") return "Choose an active candidate.";
  if (!input.stageKey) return "Choose the next candidate stage.";
  if (!input.stages.some((stage) => stage.key === input.stageKey)) return "That stage is not enabled for this company.";
  if (input.person.candidateStageKey === input.stageKey) return "Choose a different candidate stage.";
  return null;
}
