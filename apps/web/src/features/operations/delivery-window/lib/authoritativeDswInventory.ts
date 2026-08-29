export type DswInventoryRow = {
  batch_id?: string | null;
  service_date?: string | null;
  inventory_source?: "DSW_FINAL" | "DSW_IN_DAY" | string | null;
  route_key?: string | null;
  route_label?: string | null;
  driver_name?: string | null;
  planned_delivery_stops?: number | null;
  actual_delivery_stops?: number | null;
  actual_delivery_packages?: number | null;
};

export function inventoryRowToDswRow(row: DswInventoryRow) {
  const normalizedRow = {
    wa_name: row.route_label ?? null,
    wa_number: row.route_key ?? null,
    driver_name: row.driver_name ?? null,
    planned_delivery_stops: row.planned_delivery_stops ?? 0,
    actual_delivery_stops: row.actual_delivery_stops ?? 0,
    actual_delivery_packages: row.actual_delivery_packages ?? 0,
    inventory_source: row.inventory_source ?? null,
  };

  return {
    batch_id: row.batch_id ?? null,
    service_date: row.service_date ?? null,
    generated_at_text: null,
    terminal_identity: null,
    contract_filter: null,
    route_baseline_id: null,
    route_name: row.route_label ?? null,
    wa_number: row.route_key ?? null,
    driver_name: row.driver_name ?? null,
    vehicle_text: null,
    vscan_packages: 0,
    planned_delivery_stops: row.planned_delivery_stops ?? 0,
    planned_pickup_stops: 0,
    actual_delivery_stops: row.actual_delivery_stops ?? 0,
    actual_delivery_packages: row.actual_delivery_packages ?? 0,
    actual_pickup_stops: 0,
    actual_pickup_packages: 0,
    miles: null,
    route_match_method: "authoritative_dsw_inventory",
    authoritative_inventory_only: true,
    normalized_row_json: normalizedRow,
  };
}

export function shouldUseDswInventory(
  inventorySource: string | null,
  currentRowCount: number
) {
  return inventorySource === "DSW_FINAL" || currentRowCount === 0;
}
