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
  company_id: string;
  updated_at: string;
  collection_health?: AutomationStatusValue;
  runner_state?: string | null;
  runner_last_seen_at?: string | null;
  runner_last_error?: string | null;
  runner_config_version?: number | null;
  runner_applied_version?: number | null;
};

export type CollectionHealthTimes = {
  latest_collection_success_at: string | null;
  latest_ingestion_success_at: string | null;
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

export type RunnerSchedule = {
  id: string;
  company_id: string;
  company_slug: string;
  runner_key: string;
  timezone: string;
  collection_enabled: boolean;
  previous_day_close_enabled: boolean;
  previous_day_close_time: string;
  operations_pulse_enabled: boolean;
  operations_pulse_start_time: string;
  operations_pulse_end_time: string;
  report_config_json: {
    previous_day_close?: string[];
    dro_am?: {
      enabled?: boolean;
      start_time?: string;
      reports?: string[];
    };
    run_gate?: {
      authority?: "MANUAL" | "BILLING";
      manual_state?: "ACTIVE" | "INACTIVE";
    };
    operations_pulse?: string[];
    operations_pulse_interval_minutes?: number;
    route_closeout?: {
      enabled?: boolean;
      start_time?: string;
      end_time?: string;
      final_sweep_start_time?: string;
      target_poll_interval_minutes?: number;
      fcc_interval_minutes?: number;
      dsw_interval_minutes?: number;
      route_batch_size?: number;
      previous_day_recovery_enabled?: boolean;
      previous_day_recovery_max_batches?: number;
      retained_gpx_recovery_enabled?: boolean;
      retained_gpx_recovery_start_time?: string;
      retained_gpx_recovery_max_batches?: number;
      retained_gpx_recovery_interval_minutes?: number;
      reports?: string[];
    };
    operating_weekdays?: number[];
    operating_date_overrides?: Record<string, "OPERATING" | "CLOSED">;
  };
  recovery_config_json: Record<string, unknown>;
  historical_config_json: Record<string, unknown>;
  config_version: number;
  applied_version: number;
  runner_state:
    | "PENDING"
    | "APPLIED"
    | "RUNNING"
    | "IDLE"
    | "DISABLED"
    | "ERROR"
    | string;
  applied_at: string | null;
  runner_last_seen_at: string | null;
  runner_last_error: string | null;
  runner_metadata_json: Record<string, unknown>;
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
  report_batch_ids: string[] | null;
  report_count: number;
  manifest_count: number;
  route_count: number;
  output_receipt_json: Record<string, unknown> | null;
  lane_priority: number;
  registered_count: number;
  ready_count: number;
  ingesting_count: number;
  ingested_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  runtime?: CollectionRequestRuntime | null;
};

export type CollectionRequestRuntime = {
  collection_request_id: string;
  event_count: number;
  measured_artifact_count: number;
  last_activity_at: string | null;
  claim_wait_ms: number | null;
  authentication_ms: number | null;
  collection_ms: number | null;
  average_source_generation_ms: number | null;
  average_download_ms: number | null;
  average_upload_ms: number | null;
  average_processing_queue_ms: number | null;
  average_processing_ms: number | null;
  reconciliation_ms: number | null;
  end_to_end_ms: number | null;
};

export type CollectionRuntimeBaseline = {
  request_type: string;
  execution_mode: string;
  measured_run_count: number;
  median_end_to_end_ms: number | null;
  p95_end_to_end_ms: number | null;
  average_claim_wait_ms: number | null;
  average_authentication_ms: number | null;
  average_collection_ms: number | null;
  average_source_generation_ms: number | null;
  average_download_ms: number | null;
  average_upload_ms: number | null;
  average_processing_queue_ms: number | null;
  average_processing_ms: number | null;
  average_reconciliation_ms: number | null;
};

export type CollectionRecoveryCandidate = {
  candidate_key: string;
  artifact_id: string | null;
  collection_request_id: string;
  company_id: string;
  company_slug: string;
  service_date: string;
  failed_request_type: string;
  report_family_key: string | null;
  original_filename: string | null;
  error_message: string | null;
  attempt_count: number;
  failed_at: string | null;
};

export type ProtectedCollectionType =
  | "PREVIOUS_DAY_CLOSE"
  | "LAST_LOOK"
  | "HISTORICAL_BACKFILL"
  | "TARGETED_RECOVERY";

export type CollectionOrderDraft = {
  request_type: ProtectedCollectionType;
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
  report_shape_key?: string;
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
