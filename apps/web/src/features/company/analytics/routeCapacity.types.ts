export type RouteCapacityClass =
  | "BASELINE"
  | "SUPPLEMENTAL"
  | "PICKUP_ONLY"
  | "EXCLUDED";

export type RouteCapacityBand =
  | "LIGHT"
  | "NORMAL"
  | "NORMAL_LOW_CONFIDENCE"
  | "HEAVY"
  | "EXTREME"
  | null;

export type RouteCapacityThresholdBasis =
  | "ROUTE_WEEKDAY"
  | "ROUTE"
  | "COMPANY_WEEKDAY"
  | "COMPANY"
  | "INSUFFICIENT_HISTORY";

export type RouteCapacityConfidence =
  | "HIGH"
  | "MODERATE"
  | "LOW";

export type RouteCapacityRow = {
  service_date: string;
  weekday_number: number;

  route_key: string;
  route_baseline_id: string | null;
  route_name: string | null;
  wa_number: string | null;
  driver_name: string | null;

  planned_delivery_stops: number | string | null;
  actual_delivery_stops: number | string | null;
  actual_delivery_packages: number | string | null;
  planned_pickup_stops: number | string | null;
  actual_pickup_stops: number | string | null;
  actual_pickup_packages: number | string | null;

  classification_workload_stops: number | string | null;

  historical_sample_size: number | string | null;
  historical_median_stops: number | string | null;
  historical_p10_stops: number | string | null;
  historical_p25_stops: number | string | null;
  historical_p75_stops: number | string | null;
  historical_p90_stops: number | string | null;

  effective_threshold_stops: number | string | null;
  threshold_basis: RouteCapacityThresholdBasis;
  confidence_level: RouteCapacityConfidence;

  workload_ratio: number | string | null;
  planned_workload_ratio: number | string | null;
  executed_workload_ratio: number | string | null;

  route_equivalent: number | string | null;
  planned_route_equivalent: number | string | null;
  executed_route_equivalent: number | string | null;

  completion_ratio: number | string | null;

  route_class: RouteCapacityClass;
  baseline_band: RouteCapacityBand;
};

export type DailyRouteCapacitySummary = {
  service_date: string;
  weekday_number: number;

  dispatched_route_count: number;
  baseline_route_count: number;
  supplemental_route_count: number;
  pickup_only_route_count: number;
  excluded_route_count: number;

  light_baseline_count: number;
  normal_baseline_count: number;
  heavy_baseline_count: number;
  extreme_baseline_count: number;

  planned_delivery_stops: number;
  actual_delivery_stops: number;
  actual_delivery_packages: number;

  baseline_planned_delivery_stops: number;
  baseline_actual_delivery_stops: number;
  supplemental_actual_delivery_stops: number;

  normalized_route_equivalents: number;
  planned_route_equivalents: number;
  executed_route_equivalents: number;
  supplemental_route_equivalents: number;

  capacity_pressure_index: number | null;
  supplemental_volume_share: number | null;

  routes_below_75_percent_completion: number;
  routes_above_p90_workload: number;
};

export type RouteCapacityPayload = {
  range: {
    start_date: string;
    end_date: string;
  };

  rows: RouteCapacityRow[];
  days: DailyRouteCapacitySummary[];
  drivers: RouteDriverEvidenceFact[];
  route_metrics: RouteChallengeFact | null;
};

export type RouteChallengeFact = {
  operating_days: number | string;
  delivery_stops: number | string;
  delivery_packages: number | string;
  miles: number | string;
  mileage_days: number | string;
  mileage_delivery_stops: number | string;
  mileage_delivery_packages: number | string;
  road_hours: number | string;
  road_hour_days: number | string;
  road_hour_delivery_stops: number | string;
  road_hour_delivery_packages: number | string;
  duty_hours: number | string;
};

export type RouteDriverEvidenceFact = {
  roster_member_id: string;
  driver_name: string;
  fx_id: string | null;
  employment_status?: string | null;
  operating_days: number | string;
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
  mileage_days: number | string;
  mileage_delivery_stops: number | string;
  mileage_delivery_packages: number | string;
  road_hours: number | string;
  road_hour_days: number | string;
  road_hour_delivery_stops: number | string;
  road_hour_delivery_packages: number | string;
  duty_hours: number | string;
  observed_ils: number | string | null;
  first_service_date: string;
  last_service_date: string;
};

export type ScopedRouteFact = {
  service_date: string;
  weekday_number: number;
  route_baseline_id: string;
  route_name: string | null;
  wa_number: string | null;
  driver_name: string | null;
  planned_delivery_stops: number | string | null;
  actual_delivery_stops: number | string | null;
  actual_delivery_packages: number | string | null;
  planned_pickup_stops: number | string | null;
  actual_pickup_stops: number | string | null;
  actual_pickup_packages: number | string | null;
};
