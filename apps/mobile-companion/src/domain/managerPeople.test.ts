import { deriveManagerPeopleCompliance, validateCandidateStageChange, type ManagerPerson } from "./managerPeople";

const candidate: ManagerPerson = {
  id: "candidate-1",
  fullName: "Brandi Ryans",
  email: "brandi@example.com",
  phone: null,
  workerType: "Driver",
  jobTitle: null,
  employmentStatus: "Candidate",
  marketCode: "PIT",
  reportsToName: "Pat Manager",
  hireDate: null,
  separationDate: null,
  inviteStatus: "Invited",
  rosterRecordKind: "INTERNAL",
  fxId: null,
  dswid: null,
  candidateStageKey: "invited",
  candidateStageLabel: "Invited",
  candidateStageTerminal: false,
  candidateProgress: 0,
  requiredChecklistComplete: 0,
  requiredChecklistTotal: 0,
  complianceSignals: [],
};

describe("manager People authority", () => {
  it("matches the web compliance threshold policy", () => {
    const signals = deriveManagerPeopleCompliance({
      licenseExpirationDate: "2026-08-10",
      dotExpirationDate: "2026-08-31",
      qualificationExpirationDate: "2026-10-01",
    }, new Date("2026-08-12T12:00:00Z"));

    expect(signals.map((signal) => [signal.key, signal.status])).toEqual([
      ["driver_license", "expired"],
      ["dot_medical", "urgent"],
      ["qualification_certificate", "warning"],
    ]);
  });

  it("only accepts a different company-enabled stage for a candidate", () => {
    const stages = [
      { key: "onboarding", label: "Onboarding", isTerminal: false, sortOrder: 20 },
      { key: "withdrawn", label: "Withdrawn", isTerminal: true, sortOrder: 90 },
    ];
    expect(validateCandidateStageChange({ person: candidate, stageKey: "onboarding", stages })).toBeNull();
    expect(validateCandidateStageChange({ person: candidate, stageKey: "unknown", stages })).toBe("That stage is not enabled for this company.");
    expect(validateCandidateStageChange({ person: { ...candidate, employmentStatus: "Active" }, stageKey: "onboarding", stages })).toBe("Choose an active candidate.");
  });
});
