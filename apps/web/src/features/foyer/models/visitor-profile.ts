export type FoyerConcern =
  | "payroll"
  | "dispatch"
  | "planning"
  | "scheduling"
  | "onboarding"
  | "workforce"
  | "leadership"
  | "compliance"
  | "data_collection"
  | "decision_support";

export type FoyerVisitorProfile = {
  yearsOperating?: number;
  routeCount?: number;
  services?: string[];
  concerns: FoyerConcern[];
  freeformNotes: string[];
};
