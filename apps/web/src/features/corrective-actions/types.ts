export type CorrectiveActionTemplate = {
  id: string;
  template_key: string;
  category_label: string;
  event_family: string;
  title: string;
  facts_prompt: string;
  expectation_statement: string;
  action_statement: string;
  policy_reference: string | null;
  context_schema: string[];
  selection_help?: string | null;
  default_warning_level?: CorrectiveActionDraft["warning_level"];
  default_outcome_type?: CorrectiveActionDraft["outcome_type"];
  evidence_sources?: string[];
};

export type CorrectiveActionWorkspace = {
  company: { id: string; name: string; slug: string };
  preparer: { id: string; name: string };
  roster: Array<{ id: string; name: string; status: string; role: string | null }>;
  templates: CorrectiveActionTemplate[];
  actions: Array<{
    id: string;
    can_number: number;
    roster_id: string;
    employee_name: string;
    category_label: string;
    title: string;
    warning_level: string;
    outcome_type: string;
    workflow_status: string;
    incident_date: string;
    record_date: string;
    prepared_by: string;
    updated_at: string;
    content_hash: string | null;
    signed_copy_count: number;
  }>;
};

export type CorrectiveActionDraft = {
  roster_id: string;
  template_id: string;
  category_label: string;
  title: string;
  warning_level: "COACHING" | "VERBAL" | "WRITTEN" | "FINAL";
  outcome_type: "NONE" | "SUSPENSION" | "TERMINATION" | "RESIGNATION" | "JOB_ABANDONMENT";
  incident_date: string;
  record_date: string;
  facts_statement: string;
  expectation_statement: string;
  action_statement: string;
  corrective_plan: string;
  employee_response: string;
  policy_reference: string;
  suspension_start: string;
  suspension_end: string;
  occurrences: Array<{
    occurred_at: string;
    route_label: string;
    stop_references: string[];
    context_note: string;
    source_kind: "MANUAL" | "DSW";
    source_id?: string | null;
  }>;
};
