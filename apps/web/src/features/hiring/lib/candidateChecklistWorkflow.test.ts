import { describe, expect, it } from "vitest";
import {
  candidateWorkflowGroup,
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

  it("recognizes the screening send actions that require background completion", () => {
    expect(isScreeningSendStep({ display_label: "Drug Screen Sent" })).toBe(true);
    expect(isScreeningSendStep({ display_label: "DOT Physical Sent" })).toBe(true);
    expect(isScreeningSendStep({ display_label: "Drug Test Passed" })).toBe(false);
    expect(isScreeningSendStep({ display_label: "DOT Physical Passed" })).toBe(false);
  });

  it("recognizes TSA steps even when they also contain background language", () => {
    expect(isTsaStep({ item_key: "tsa_background_express_terminal" })).toBe(true);
    expect(isTsaStep({ display_label: "TSA terminal clearance" })).toBe(true);
  });

  it("classifies sequential screening milestones and their subtle groups", () => {
    expect(candidateWorkflowStepKind({ display_label: "Interview Complete" })).toBe("interview_complete");
    expect(candidateWorkflowStepKind({ display_label: "Background Passed" })).toBe("background_complete");
    expect(candidateWorkflowStepKind({ display_label: "Drug Screen Sent" })).toBe("drug_sent");
    expect(candidateWorkflowStepKind({ display_label: "Drug Test Passed" })).toBe("drug_passed");
    expect(candidateWorkflowStepKind({ display_label: "DOT Physical Sent" })).toBe("dot_sent");
    expect(candidateWorkflowStepKind({ display_label: "DOT Physical Passed" })).toBe("dot_passed");
    expect(candidateWorkflowGroup({ display_label: "Drug Test Passed" })).toBe("Screening");
  });
});
