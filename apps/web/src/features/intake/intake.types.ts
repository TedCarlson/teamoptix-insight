export type IntakeLob = { id: string; key: string; label: string; description: string | null; active: boolean; sortOrder: number };
export type IntakeCapability = IntakeLob & { lobIds: string[] };
export type IntakeQuestion = {
  id: string; key: string; label: string; helperText: string | null; placeholder: string | null;
  fieldType: "text" | "email" | "tel" | "number" | "textarea" | "select" | "checkbox";
  required: boolean; scope: "shared" | "specific"; options: string[]; status: "draft" | "active" | "retired";
  sortOrder: number; lobIds: string[]; capabilityIds: string[];
};
export type IntakeContract = { linesOfBusiness: IntakeLob[]; capabilities: IntakeCapability[]; questions: IntakeQuestion[] };

