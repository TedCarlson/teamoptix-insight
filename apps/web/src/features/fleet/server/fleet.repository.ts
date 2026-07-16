import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { FleetVehicleRow } from "../fleet.types";

export async function listFleetVehicles(companySlug: string): Promise<FleetVehicleRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("company_fleet_vehicle_v")
    .select("*")
    .eq("company_slug", companySlug)
    .order("unit_number", { ascending: true });

  if (error) {
    // The Fleet migration may not be deployed in every environment yet.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`Unable to load Fleet vehicles: ${error.message}`);
  }

  return (data ?? []) as FleetVehicleRow[];
}

async function listView(companySlug: string, view: string, order: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from(view).select("*").eq("company_slug", companySlug).order(order, { ascending: false });
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return [];
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const listFleetInspections = (slug: string) => listView(slug, "company_fleet_inspection_v", "started_at");
export const listFleetDefects = (slug: string) => listView(slug, "company_fleet_defect_v", "reported_at");
export const listFleetWorkOrders = (slug: string) => listView(slug, "company_fleet_work_order_v", "opened_at");

export async function getFleetStatus(companySlug: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("company_fleet_status_v").select("*").eq("company_slug", companySlug).maybeSingle();
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return null;
  if (error) throw new Error(error.message);
  return data;
}
