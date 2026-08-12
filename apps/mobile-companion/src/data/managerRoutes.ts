import type { ManagerAccessContext } from "../domain/access";
import {
  validateManagerRouteDraft,
  type ManagerRoute,
  type ManagerRouteDraft,
  type ManagerRoutesSnapshot,
} from "../domain/managerRoutes";
import { getSupabaseClient } from "../lib/supabase";

type RouteRow = {
  id: string; route_name: string; current_wa_num: string | null; route_location: string | null;
  route_type: string; threshold_stops: number | null; threshold_rate: number | string | null;
  runs_s: boolean; runs_u: boolean; runs_m: boolean; runs_t: boolean; runs_w: boolean; runs_h: boolean; runs_f: boolean;
  rotation_name: string | null; is_active: boolean; effective_start: string; effective_end: string | null;
};

function requireRoutes(context: ManagerAccessContext) {
  if (!context.grants.includes("routes")) throw new Error("Routes access is not in this role's scope.");
}

function routeFromRow(row: RouteRow): ManagerRoute {
  return {
    id: row.id, routeName: row.route_name, currentWaNumber: row.current_wa_num, routeLocation: row.route_location,
    routeType: row.route_type, thresholdStops: row.threshold_stops,
    thresholdRate: row.threshold_rate == null ? null : Number(row.threshold_rate),
    runs: { s: row.runs_s, u: row.runs_u, m: row.runs_m, t: row.runs_t, w: row.runs_w, h: row.runs_h, f: row.runs_f },
    rotationName: row.rotation_name, isActive: row.is_active,
    effectiveStart: row.effective_start, effectiveEnd: row.effective_end,
  };
}

export async function loadManagerRoutesSnapshot(context: ManagerAccessContext): Promise<ManagerRoutesSnapshot> {
  requireRoutes(context);
  const result = await getSupabaseClient().from("route_baseline")
    .select("id, route_name, current_wa_num, route_location, route_type, threshold_stops, threshold_rate, runs_s, runs_u, runs_m, runs_t, runs_w, runs_h, runs_f, rotation_name, is_active, effective_start, effective_end")
    .eq("company_id", context.company_id).order("route_name").order("effective_start", { ascending: false });
  if (result.error) throw result.error;
  const history = ((result.data ?? []) as RouteRow[]).map(routeFromRow);
  const activeRoutes = history.filter((route) => route.isActive && route.effectiveEnd === null);
  return {
    activeRoutes, history,
    coreCount: activeRoutes.filter((route) => route.routeType === "CORE").length,
    thresholdCount: activeRoutes.filter((route) => route.thresholdStops != null).length,
  };
}

export async function saveManagerRoute(context: ManagerAccessContext, routeId: string | null, draft: ManagerRouteDraft) {
  requireRoutes(context);
  const validation = validateManagerRouteDraft(draft);
  if (validation) throw new Error(validation);
  const result = await getSupabaseClient().rpc("save_company_route_baseline", {
    p_company_slug: context.company_slug, p_route_id: routeId, p_route_name: draft.routeName.trim(),
    p_current_wa_num: draft.currentWaNumber.trim() || null, p_route_location: draft.routeLocation.trim() || null,
    p_route_type: draft.routeType, p_threshold_stops: draft.thresholdStops.trim() ? Number(draft.thresholdStops) : null,
    p_threshold_rate: draft.thresholdRate.trim() ? Number(draft.thresholdRate) : null,
    p_runs_s: draft.runs.s, p_runs_u: draft.runs.u, p_runs_m: draft.runs.m, p_runs_t: draft.runs.t,
    p_runs_w: draft.runs.w, p_runs_h: draft.runs.h, p_runs_f: draft.runs.f,
    p_rotation_name: draft.rotationName.trim() || null, p_is_active: draft.isActive,
  });
  if (result.error) throw result.error;
  return result.data;
}
