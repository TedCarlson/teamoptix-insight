export type AttendanceCell = {
  present: boolean;
  callout: boolean;
  noShow: boolean;
  sources: string[];
  details: string[];
  adjustmentAmount?: number;
  adjustmentLabels?: string[];
};

export type AttendanceRow = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  days: Record<string, AttendanceCell>;
};

export type PayrollSummaryRow = {
  roster_member_id: string | null;
  person_name: string;
  days_worked: number;
  worked_days?: string[];
  daily_pay_total: number;
  threshold_pay_total: number;
  adjustment_total?: number;
  estimated_total: number;
};

export type PayrollActivityRow = {
  service_date: string;
  roster_member_id: string | null;
  person_name: string | null;
  attendance_status: string | null;
  source_kind: string | null;
  daily_pay_effective_date?: string | null;
  daily_pay_rate?: number | null;
  daily_pay_eligible?: boolean | null;
  route_name?: string | null;
  wa_number?: string | null;
  vehicle_text?: string | null;
  actual_delivery_stops?: number | null;
  actual_delivery_packages?: number | null;
  actual_pickup_stops?: number | null;
  actual_pickup_packages?: number | null;
  threshold_stops?: number | null;
  threshold_rate?: number | null;
  threshold_overage?: number | null;
  threshold_pay_amount?: number | null;
  adjustment_amount?: number | null;
  adjustment_labels?: string[] | null;
  review_flags?: string[] | null;
  metadata_json?: Record<string, unknown> | null;
};

export type PayrollMetrics = {
  record_count: number;
  payable_days: number;
  estimated_payroll: number;
  estimated_threshold_pay: number;
  summary: PayrollSummaryRow[];
  activity: PayrollActivityRow[];
};


export type PayrollRouteCollectionItem = {
  wa_number: string;
  route_name: string | null;
  row_count: number;
  delivery_stops: number;
  pickup_stops: number;
  total_stops: number;
  threshold_stops: number | null;
  threshold_rate: number | null;
};

export type PayrollDriverDayDetailRow = {
  key: string;
  roster_member_id: string | null;
  person_name: string;
  service_date: string;
  route_collection: PayrollRouteCollectionItem[];
  dominant_route: PayrollRouteCollectionItem | null;
  route_collection_label: string;
  total_stops: number;
  threshold_stops: number | null;
  threshold_rate: number | null;
  threshold_overage: number;
  threshold_pay_amount: number;
  daily_pay_rate: number | null;
  daily_pay_applied: number;
  adjustment_pay_amount: number;
  estimated_total: number;
  source_row_count: number;
  flags: string[];
};
