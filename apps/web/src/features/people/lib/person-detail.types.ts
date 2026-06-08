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
  separation_date?: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
  onboarding_completed_at?: string | null;

  fx_id?: string | null;
  dswid?: string | null;
  dot_expiration_date?: string | null;
  qual_cert_expiration_date?: string | null;
  daily_pay_effective_date?: string | null;
  daily_pay_rate?: string | number | null;
  scanner_serial?: string | null;
  fuel_card?: string | null;
  pin_id_no?: string | null;
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

export type PersonRecord = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  worker_type: string;
  employment_status: "Active" | "Candidate" | "Former";
  market_code: string;
  reports_to_name: string;
  hire_date: string;
  separation_date: string | null;
  invite_status: string;
  compliance_summary: string;
  onboarding_completed_at: string | null;

  fx_id: string | null;
  dswid: string | null;
  dot_expiration_date: string | null;
  qual_cert_expiration_date: string | null;
  daily_pay_effective_date: string | null;
  daily_pay_rate: string | number | null;
  scanner_serial: string | null;
  fuel_card: string | null;
  pin_id_no: string | null;
};
