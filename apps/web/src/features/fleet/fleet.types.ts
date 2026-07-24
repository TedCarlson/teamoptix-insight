export type FleetVehicleStatus =
  | "READY"
  | "ASSIGNED"
  | "SPARE"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE"
  | "RETIRED";

export type FleetVehicleRow = {
  vehicle_id: string;
  company_id: string;
  company_slug: string;
  unit_number: string;
  fedex_vehicle_id: string | null;
  vehicle_class_key: string | null;
  vehicle_type: string;
  status: FleetVehicleStatus;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  plate_number: string | null;
  plate_state: string | null;
  primary_route: string | null;
  primary_driver_name: string | null;
  odometer_miles: number | null;
  gvwr_lbs: number | null;
  dot_weight_class: number | null;
  federal_overtime_weight_band: "SMALL_VEHICLE_10K_OR_LESS" | "OVER_10K" | "UNVERIFIED";
  gvwr_source: string | null;
  gvwr_verified_at: string | null;
  gvwr_evidence_reference: string | null;
  gvwr_verified_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "DISPUTED" | "EXPIRED";
  wheel_size: string | null;
  front_tire_size: string | null;
  rear_tire_size: string | null;
  rear_tire_configuration: string | null;
  tire_type: string | null;
  open_defect_count: number;
  open_work_order_count: number;
  last_inspected_at: string | null;
};
