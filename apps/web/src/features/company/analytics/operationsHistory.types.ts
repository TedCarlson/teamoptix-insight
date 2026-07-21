export type AvailableOperationsHistoryYear = {
  operating_year: number | string;
  finalized_operating_day_count: number | string;
  through_service_date: string | null;
};

export type OperationsHistoryMetadata = {
  requested_year: number;
  start_date: string;
  end_date: string;
  generated_at: string;
  through_service_date: string | null;
  source_family: "DSW";
  finalized_operating_day_count: number;
  snapshot_kind?: string;
  payload_grain?: string;
  retrieval_strategy?: string;
  requested_month_count?: number;
  month_blocks?: Array<{
    start_date: string;
    end_date: string;
    finalized_operating_day_count: number;
  }>;
};

export type OperationsHistoryRow = {
  batch_id: string;
  company_id: string;
  service_date: string;
  weekday_number: number;
  weekday_key: string;
  is_weekday: boolean;
  is_weekend: boolean;
  source_filename: string | null;
  batch_created_at: string;
  generated_at_text: string | null;
  terminal_identity: string | null;
  contract_label: string | null;
  route_count: number | string | null;
  actual_delivery_stops: number | string | null;
  actual_delivery_packages: number | string | null;
  actual_pickup_stops: number | string | null;
  actual_pickup_packages: number | string | null;
  total_stops: number | string | null;
  total_packages: number | string | null;
  recorded_miles: number | string | null;
  valid_miles: number | string | null;
  mileage_anomaly_count: number | string | null;
  routes_with_miles: number | string | null;
  on_road_hours: number | string | null;
  on_duty_hours: number | string | null;
  routes_with_road_hours: number | string | null;
  routes_with_duty_hours: number | string | null;
  potential_dot_hours_violations: number | string | null;
  ils_percent: number | string | null;
  ils_impact_packages: number | string | null;
  exceptions: number | string | null;
  dna: number | string | null;
  code_85: number | string | null;
  send_again: number | string | null;
  all_status_code_packages: number | string | null;
  required_signature: number | string | null;
  planned_delivery_stops: number | string | null;
  planned_pickup_stops: number | string | null;
  normalized_row_json: Record<string, unknown> | null;
};

export type OperationsHistoryPayload = {
  metadata: OperationsHistoryMetadata;
  rows: OperationsHistoryRow[];
};
