export type ApiRosterRow = {
  roster_member_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  worker_type: string | null;
  employment_status: "Active" | "Candidate" | "Former" | null;
  market_code: string | null;
  reports_to_name: string | null;
  hire_date: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
  onboarding_completed_at?: string | null;
};

export type ApiEventRow = {
  id: string;
  company_id: string;
  roster_id: string;
  event_category: string;
  event_type: string;
  event_detail: string | null;
  event_metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

export type CandidateRecord = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  worker_type: string;
  employment_status: "Active" | "Candidate" | "Former";
  market_code: string;
  reports_to_name: string;
  hire_date: string;
  invite_status: string;
  compliance_summary: string;
  onboarding_completed_at: string | null;
};

export type OnboardingStep = {
  step_key: string;
  label: string;
  step_order: number;
  completed: boolean;
  completed_at: string | null;
};

export type OnboardingPayload = {
  has_session: boolean;
  session_id: string | null;
  session_status: string | null;
  onboarding_completed_at: string | null;
  progress_pct: number;
  current_step: string | null;
  steps: OnboardingStep[];
};
