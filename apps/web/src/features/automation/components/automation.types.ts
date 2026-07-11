export type AutomationConfigPanelProps = {
  slug: string;
  canEdit: boolean;
  credentialMode?: AutomationCredentialMode;
  workspaceMode?: "customer" | "governance";
  showOperationsWorkspace?: boolean;
};

export type AutomationStatusValue =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "HEALTHY"
  | "WARNING"
  | "ACTION_REQUIRED"
  | "DISABLED";

export type AutomationStatusResponse = {
  provider_key: "FEDEX";
  status: AutomationStatusValue;
  profile_id: string;
  updated_at: string;
};

export type CredentialResponse = {
  username?: string;
  has_secret: boolean;
  last_verified_at: string | null;
  last_verification_result: string | null;
};

export type AutomationCredentialMode =
  | "customer_managed"
  | "status_only";

export type AutomationRun = {
  id: string;
  automation_type: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  inserted_rows: number | null;
  matched_rows: number | null;
  unmatched_rows: number | null;
  batch_id: string | null;
  error_message: string | null;
};

export type ScheduleRow = {
  id: string;
  company_id: string;
  company_slug: string;
  automation_type: "DSW" | "FCC" | "DRO_AM" | "DRO_PM" | string;
  is_enabled: boolean;
  cadence_minutes: number;
  window_preset: "SORT_DELIVERY_DAY" | "BUSINESS_DAY" | "OFF" | string;
  start_time: string;
  end_time: string;
  min_cooldown_minutes: number;
  created_at: string;
  updated_at: string;
};

export type CollectionRequest = {
  id: string;
  company_id: string;
  company_slug: string;
  request_type: string;
  request_status: string;
  priority: number;
  service_date: string | null;
  service_date_start: string | null;
  service_date_end: string | null;
  requested_reports: string[];
  request_payload: Record<string, unknown>;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ProtectedCollectionType =
  | "PREVIOUS_DAY_CLOSE"
  | "LAST_LOOK"
  | "HISTORICAL_BACKFILL"
  | "TARGETED_RECOVERY";

export type CollectionOrderDraft = {
  request_type: ProtectedCollectionType | "OPERATIONS_PULSE";
  service_date?: string | null;
  service_date_start?: string | null;
  service_date_end?: string | null;
  requested_reports: string[];
  priority: number;
  request_payload: Record<string, unknown>;
};

export type CollectionTarget = {
  key: string;
  label: string;
  description: string;
  report_family_key: "DSW" | "FCC";
  artifact_key: string;
  runner_section: "P_AND_D" | "SERVICE" | "DAILY_SERVICE";
  vps_target: number;
  expected_filename_match: string[];
  default_last_look: boolean;
  default_targeted: boolean;
};

export type CollectionProfile = {
  type: ProtectedCollectionType;
  title: string;
  badge: string;
  tone: "blue" | "green" | "slate";
  description: string;
  reports: string[];
  footer: string;
  priority: number;
};

