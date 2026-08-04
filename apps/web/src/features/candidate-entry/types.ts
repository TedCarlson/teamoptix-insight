export type CandidateRequirementPreview = {
  requirement_key: string;
  label: string;
  description?: string | null;
  category: string;
  phase: string;
  evidence_type?: string | null;
  is_required: boolean;
  is_blocking: boolean;
  source_scope: "generic" | "industry" | "company";
};

export type CandidateInterviewSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  meeting_provider: string;
};

export type CandidateFoyerExperience = {
  entry: {
    id?: string | null;
    entry_code?: string | null;
    link_type?: "company_general" | "company_invite" | "member_referral" | null;
    label?: string | null;
    source_type: "organic" | "company_link" | "company_invite" | "member_referral";
    role_key?: string | null;
    location_key?: string | null;
    assignment_key?: string | null;
    scheduling_policy: "required" | "offered" | "bypassed";
    bypass_reason?: string | null;
  };
  company?: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string | null;
    industry_id?: string | null;
    industry_label?: string | null;
  } | null;
  requirements: CandidateRequirementPreview[];
  interview_slots: CandidateInterviewSlot[];
  options: {
    roles: Array<{ value: string; label: string }>;
    locations: Array<{ value: string; label: string }>;
  };
  bio?: {
    headline?: string | null;
    summary?: string | null;
    terminal_name?: string | null;
    terminal_address?: string | null;
    primary_work_area?: string | null;
    work_description?: string | null;
    candidate_note?: string | null;
  } | null;
};
