export type ScorecardPeriodKey =
  | "LAST_5_WEEKS"
  | "LAST_MONTH"
  | "MTD"
  | "CONTRACT";

export type ScorecardMetric = {
  metric_key: string;
  display_name: string;
  category_key: "CUSTOMER" | "SERVICE" | "SAFETY";
  contribution_weight: number | string;
  scoring_method: "BAND" | "BINARY_ZERO" | "RYDE_NET" | "PRI_TIER";
  target_primary: number | string | null;
  target_secondary: number | string | null;
  target_tertiary: number | string | null;
  points_primary: number | string | null;
  points_secondary: number | string | null;
  points_tertiary: number | string | null;
  source_mode: "WAREHOUSE" | "FEDEX_IMPORT" | "CLIENT_ENTRY" | "EVENT_LEDGER";
  enabled: boolean;
  sort_order: number;
};

export type DriverPeriodSummary = {
  operating_days: number | string;
  route_days: number | string;
  delivery_stops: number | string;
  delivery_packages: number | string;
  pickup_stops: number | string;
  pickup_packages: number | string;
  early_pickups: number | string;
  late_pickups: number | string;
  potential_missed_pickups: number | string;
  pickup_reliability_complete?: boolean | null;
  pickup_pri?: number | string | null;
  pickup_pri_tier?: "T1" | "T2" | "T3" | "T4" | null;
  exceptions: number | string;
  code_85: number | string;
  dna: number | string;
  send_again: number | string;
  required_signature: number | string;
  miles: number | string;
  road_hours: number | string;
  duty_hours: number | string;
  observed_ils: number | string | null;
};

export type DriverScorecardIndexRow = {
  roster_id: string;
  full_name: string;
  fx_id: string | null;
  dswid: string | null;
  employment_status: string;
  daily_pay_rate: number | string | null;
  periods: Partial<Record<ScorecardPeriodKey, DriverPeriodSummary>>;
};

export type DriverScorecardIndexPayload = {
  range: {
    contract_start: string;
    contract_end: string;
    as_of_date: string;
    last_five_weeks_start?: string | null;
    last_five_weeks_end?: string | null;
    last_month_start: string;
    last_month_end: string;
    mtd_start: string;
  };
  model: {
    id: string;
    title: string;
    version: number;
    metrics: ScorecardMetric[];
  };
  drivers: DriverScorecardIndexRow[];
  unmatched_route_rows: number;
  read_model?: string;
  error?: string;
};

export type DriverScorecardDetailRow = {
  service_date: string;
  route_name: string | null;
  wa_number: string | null;
  delivery_stops: number | string;
  delivery_packages: number | string;
  pickup_stops: number | string;
  pickup_packages: number | string;
  early_pickups: number | string;
  late_pickups: number | string;
  potential_missed_pickups: number | string;
  exceptions: number | string;
  code_85: number | string;
  dna: number | string;
  send_again: number | string;
  required_signature: number | string;
  miles: number | string;
  road_hours: number | string;
  duty_hours: number | string;
  observed_ils: number | string | null;
};

export type DriverScorecardDetailPayload = {
  rows: DriverScorecardDetailRow[];
  error?: string;
};
