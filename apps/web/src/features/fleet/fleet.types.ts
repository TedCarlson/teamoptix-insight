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
  wheel_size: string | null;
  front_tire_size: string | null;
  rear_tire_size: string | null;
  rear_tire_configuration: string | null;
  open_defect_count: number;
  open_work_order_count: number;
  last_inspected_at: string | null;
};
