import { describe, expect, it } from "vitest";
import {
  candidateWorkflowGroup,
  candidateWorkflowPrerequisiteKinds,
  candidateWorkflowStepKind,
  isBackgroundStep,
  isScreeningSendStep,
  isTsaStep,
} from "./candidateChecklistWorkflow";

describe("candidate checklist workflow classification", () => {
  it("classifies ordinary background milestones separately from TSA", () => {
    expect(isBackgroundStep({ item_key: "background_submitted" })).toBe(true);
    expect(isBackgroundStep({ display_label: "Background Check Cleared" })).toBe(true);
    expect(isBackgroundStep({ item_key: "tsa_background_express_terminal" })).toBe(false);
  });

  it("recognizes screening send actions independently of pass results", () => {
    expect(isScreeningSendStep({ display_label: "Drug Screen Sent" })).toBe(true);
    expect(isScreeningSendStep({ display_label: "DOT Physical Sent" })).toBe(true);
    expect(isScreeningSendStep({ display_label: "Drug Test Passed" })).toBe(false);
    expect(isScreeningSendStep({ display_label: "DOT Physical Passed" })).toBe(false);
  });

  it("recognizes TSA steps even when they also contain background language", () => {
    expect(isTsaStep({ item_key: "tsa_background_express_terminal" })).toBe(true);
    expect(isTsaStep({ display_label: "TSA terminal clearance" })).toBe(true);
  });

  it("groups background, drug, and DOT milestones into sent and passed phases", () => {
    expect(candidateWorkflowStepKind({ display_label: "Interview Complete" })).toBe("interview_complete");
    expect(candidateWorkflowStepKind({ display_label: "Background Passed" })).toBe("background_complete");
    expect(candidateWorkflowStepKind({ display_label: "Drug Screen Sent" })).toBe("drug_sent");
    expect(candidateWorkflowStepKind({ display_label: "Drug Test Passed" })).toBe("drug_passed");
    expect(candidateWorkflowStepKind({ display_label: "DOT Physical Sent" })).toBe("dot_sent");
    expect(candidateWorkflowStepKind({ display_label: "DOT Physical Passed" })).toBe("dot_passed");
    expect(candidateWorkflowGroup({ display_label: "Background Submitted" })).toBe("Sent");
    expect(candidateWorkflowGroup({ display_label: "Drug Screen Sent" })).toBe("Sent");
    expect(candidateWorkflowGroup({ display_label: "DOT Physical Sent" })).toBe("Sent");
    expect(candidateWorkflowGroup({ display_label: "Background Passed" })).toBe("Passed");
    expect(candidateWorkflowGroup({ display_label: "Drug Test Passed" })).toBe("Passed");
    expect(candidateWorkflowGroup({ display_label: "DOT Physical Passed" })).toBe("Passed");
  });

  it("allows parallel sent milestones and lets passed milestones imply sent", () => {
    expect(candidateWorkflowPrerequisiteKinds("background_submitted")).toEqual(["interview_complete"]);
    expect(candidateWorkflowPrerequisiteKinds("drug_sent")).toEqual(["interview_complete"]);
    expect(candidateWorkflowPrerequisiteKinds("dot_sent")).toEqual(["interview_complete"]);
    expect(candidateWorkflowPrerequisiteKinds("background_complete")).toEqual([]);
    expect(candidateWorkflowPrerequisiteKinds("drug_passed")).toEqual([]);
    expect(candidateWorkflowPrerequisiteKinds("dot_passed")).toEqual([]);
  });
});
