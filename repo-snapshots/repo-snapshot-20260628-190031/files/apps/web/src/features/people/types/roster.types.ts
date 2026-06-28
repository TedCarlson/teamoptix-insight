export type RosterEmploymentStatus = "Active" | "Candidate" | "Trainee" | "Former";

export type RosterInviteStatus =
  | "Not Invited"
  | "Invited"
  | "Linked"
  | string;

export type RosterComplianceSummary =
  | "Compliant"
  | "Missing"
  | "Expiring"
  | "Expired"
  | "Archived"
  | string;

export type RosterRow = {
  roster_member_id: string;

  person_id?: string | null;
  profile_id?: string | null;

  full_name: string;
  email: string | null;
  phone: string | null;

  worker_type: string | null;
  job_title?: string | null;

  employment_status: RosterEmploymentStatus;

  market_code: string | null;
  reports_to_name: string | null;

  hire_date: string | null;
  separation_date?: string | null;

  invite_status: RosterInviteStatus;
  compliance_summary: RosterComplianceSummary;

  notes?: string | null;

  date_of_birth?: string | null;

  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;

  license_number?: string | null;
  issuing_state?: string | null;
  license_issue_date?: string | null;
  license_expiration_date?: string | null;

  fx_id?: string | null;
  dswid?: string | null;

  dot_expiration_date?: string | null;
  qual_cert_expiration_date?: string | null;

  daily_pay_effective_date?: string | null;
  daily_pay_rate?: string | number | null;
  trainee_daily_pay_rate?: string | number | null;
  trainee_pay_effective_start?: string | null;

  scanner_serial?: string | null;
  fuel_card?: string | null;
  pin_id_no?: string | null;

  candidate_stage_key?: string | null;
  candidate_stage_label?: string | null;
  candidate_stage_is_terminal?: boolean | null;

  candidate_progress?: {
    required_total: number;
    required_complete: number;
    percent: number;
  } | null;
};
