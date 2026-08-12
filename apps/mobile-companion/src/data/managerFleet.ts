import type { ManagerAccessContext } from "../domain/access";
import {
  validateManagerFleetWorkOrder,
  validateManagerFleetWorkOrderStatus,
  type ManagerFleetSnapshot,
  type ManagerFleetWorkOrderDraft,
} from "../domain/managerFleet";
import { getSupabaseClient } from "../lib/supabase";

export async function loadManagerFleetSnapshot(context: ManagerAccessContext): Promise<ManagerFleetSnapshot> {
  if (!context.grants.includes("fleet")) throw new Error("Fleet access is not in this role's scope.");
  const supabase = getSupabaseClient();
  const [status, vehicles, defects, orders, inspections] = await Promise.all([
    supabase.from("company_fleet_status_v").select("*").eq("company_slug", context.company_slug).maybeSingle(),
    supabase.from("company_fleet_vehicle_v").select("*").eq("company_slug", context.company_slug).neq("status", "RETIRED").order("unit_number"),
    supabase.from("company_fleet_defect_v").select("*").eq("company_slug", context.company_slug).order("reported_at", { ascending: false }),
    supabase.from("company_fleet_work_order_v").select("*").eq("company_slug", context.company_slug).order("opened_at", { ascending: false }),
    supabase.from("company_fleet_inspection_v").select("*").eq("company_slug", context.company_slug).order("started_at", { ascending: false }).limit(80),
  ]);
  const error = status.error ?? vehicles.error ?? defects.error ?? orders.error ?? inspections.error;
  if (error) throw error;
  const summary = status.data ?? {};
  return {
    totalVehicles: Number(summary.total_vehicles ?? 0), dispatchReady: Number(summary.dispatch_ready ?? 0),
    spareVehicles: Number(summary.spare_vehicles ?? 0), unavailable: Number(summary.unavailable ?? 0),
    openDefects: Number(summary.open_defects ?? 0), openWorkOrders: Number(summary.open_work_orders ?? 0),
    verifiedGvwr: Number(summary.verified_gvwr ?? 0), missingGvwr: Number(summary.missing_gvwr ?? 0),
    vehicles: (vehicles.data ?? []).map((row) => ({
      id: row.vehicle_id, unitNumber: row.unit_number, status: row.status,
      description: [row.year, row.make, row.model].filter(Boolean).join(" ") || String(row.vehicle_type ?? "Vehicle").replaceAll("_", " "),
      vehicleClass: row.vehicle_class_key, route: row.primary_route, driverName: row.primary_driver_name,
      odometerMiles: row.odometer_miles, lastInspectedAt: row.last_inspected_at,
      openDefectCount: Number(row.open_defect_count ?? 0), openWorkOrderCount: Number(row.open_work_order_count ?? 0),
      gvwrLbs: row.gvwr_lbs, gvwrStatus: row.gvwr_verified_status ?? "UNVERIFIED",
      federalWeightBand: row.federal_overtime_weight_band ?? "UNVERIFIED",
    })),
    defects: (defects.data ?? []).map((row) => ({ id: row.id, vehicleId: row.vehicle_id, unitNumber: row.unit_number,
      summary: row.summary, description: row.description, severity: row.severity, status: row.status,
      reportedAt: row.reported_at, safeToOperate: row.safe_to_operate_driver })),
    workOrders: (orders.data ?? []).map((row) => ({ id: row.id, vehicleId: row.vehicle_id, unitNumber: row.unit_number,
      number: Number(row.work_order_number), title: row.title, scope: row.scope_of_work, priority: row.priority,
      status: row.status, mechanicName: row.mechanic_name, openedAt: row.opened_at, totalCost: Number(row.total_cost ?? 0) })),
    inspections: (inspections.data ?? []).map((row) => ({ id: row.id, vehicleId: row.vehicle_id, unitNumber: row.unit_number,
      driverName: row.driver_name, inspectionType: row.inspection_type, status: row.status, startedAt: row.started_at,
      defectCount: Number(row.defect_count ?? 0), safeToOperate: row.safe_to_operate_driver })),
  };
}

export async function createManagerFleetWorkOrder(context: ManagerAccessContext, draft: ManagerFleetWorkOrderDraft) {
  if (!context.grants.includes("fleet")) throw new Error("Fleet access is not in this role's scope.");
  const validation = validateManagerFleetWorkOrder(draft);
  if (validation) throw new Error(validation);
  const result = await getSupabaseClient().rpc("create_company_fleet_work_order", {
    p_company_slug: context.company_slug, p_vehicle_id: draft.vehicleId, p_defect_id: draft.defectId,
    p_title: draft.title.trim(), p_scope: draft.scope.trim(), p_priority: draft.priority,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function updateManagerFleetWorkOrder(context: ManagerAccessContext, workOrderId: string, status: string) {
  if (!context.grants.includes("fleet")) throw new Error("Fleet access is not in this role's scope.");
  const validation = validateManagerFleetWorkOrderStatus(status);
  if (validation) throw new Error(validation);
  const result = await getSupabaseClient().rpc("update_company_fleet_work_order", {
    p_company_slug: context.company_slug, p_work_order_id: workOrderId, p_status: status,
    p_completion_notes: "", p_labor_cost: null, p_parts_cost: null, p_outside_cost: null,
  });
  if (result.error) throw result.error;
}
