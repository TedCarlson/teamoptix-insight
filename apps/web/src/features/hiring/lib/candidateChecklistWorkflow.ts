type WorkflowItem = Record<string, unknown>;

export type CandidateWorkflowStepKind =
  | "interview_scheduled"
  | "interview_complete"
  | "background_submitted"
  | "background_complete"
  | "drug_sent"
  | "drug_passed"
  | "dot_sent"
  | "dot_passed"
  | "tsa"
  | "other";

export type CandidateWorkflowGroup =
  | "Interview"
  | "Sent"
  | "Passed"
  | "Terminal access"
  | "Readiness";

export function candidateWorkflowText(item: WorkflowItem) {
  return [item.item_key, item.display_label, item.default_label]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isTsaStep(item: WorkflowItem) {
  return candidateWorkflowText(item).split(" ").includes("tsa");
}

export function isBackgroundStep(item: WorkflowItem) {
  return candidateWorkflowText(item).includes("background") && !isTsaStep(item);
}

export function isScreeningSendStep(item: WorkflowItem) {
  const value = candidateWorkflowText(item);
  const isSendAction =
    value.includes("sent") || value.includes("send") || value.includes("request");
  const isDrugScreen =
    value.includes("drug") && (value.includes("screen") || value.includes("test"));
  const isDotPhysical = value.includes("dot") && value.includes("physical");

  return isSendAction && (isDrugScreen || isDotPhysical);
}

export function candidateWorkflowStepKind(item: WorkflowItem): CandidateWorkflowStepKind {
  const value = candidateWorkflowText(item);
  const hasAny = (...terms: string[]) => terms.some((term) => value.includes(term));

  if (isTsaStep(item)) return "tsa";
  if (value.includes("interview") && hasAny("scheduled", "schedule")) {
    return "interview_scheduled";
  }
  if (value.includes("interview") && hasAny("complete", "completed", "passed")) {
    return "interview_complete";
  }
  if (value.includes("background") && hasAny("submit", "submitted", "authorization", "authorized")) {
    return "background_submitted";
  }
  if (value.includes("background")) return "background_complete";

  const isDrug = value.includes("drug") && hasAny("screen", "test");
  const isDot = value.includes("dot") && value.includes("physical");
  const isSent = hasAny("send", "sent", "request");
  const isPassed = hasAny("pass", "passed", "complete", "completed", "clear", "cleared");

  if (isDrug && isSent) return "drug_sent";
  if (isDrug && isPassed) return "drug_passed";
  if (isDot && isSent) return "dot_sent";
  if (isDot && isPassed) return "dot_passed";
  return "other";
}

export function candidateWorkflowGroup(item: WorkflowItem): CandidateWorkflowGroup {
  const kind = candidateWorkflowStepKind(item);

  if (kind.startsWith("interview")) return "Interview";
  if (["background_submitted", "drug_sent", "dot_sent"].includes(kind)) return "Sent";
  if (["background_complete", "drug_passed", "dot_passed"].includes(kind)) return "Passed";
  if (kind === "tsa") return "Terminal access";
  return "Readiness";
}

export function candidateWorkflowPrerequisiteKinds(
  kind: CandidateWorkflowStepKind
): CandidateWorkflowStepKind[] {
  if (kind === "interview_complete") return ["interview_scheduled"];
  if (["background_submitted", "drug_sent", "dot_sent"].includes(kind)) {
    return ["interview_complete"];
  }
  return [];
}
