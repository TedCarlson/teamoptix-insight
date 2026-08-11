import type { ManagerAccessContext } from "../domain/access";
import {
  addScheduleDays,
  buildManagerScheduleSnapshot,
  type ManagerScheduleOverride,
  type ManagerScheduleRoute,
  type ManagerScheduleRow,
  type ManagerTimeOffRequest,
} from "../domain/managerSchedule";
import { getSupabaseClient } from "../lib/supabase";

type FactRow = Omit<ManagerScheduleRow, "override_type"> & {
  override_type?: string | null;
};

type ProjectionRow = {
  service_date: string;
  roster_member_id: string;
  planned_on: boolean;
  route_name: string | null;
  override_id: string | null;
};

type RosterIdentity = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
};

type RequestRow = Omit<ManagerTimeOffRequest, "full_name" | "worker_type">;
type OverrideRow = Omit<ManagerScheduleOverride, "full_name">;

function cleanName(value: string | null | undefined) {
  return value?.trim() || "Roster member";
}

export async function loadManagerScheduleSnapshot(
  context: ManagerAccessContext,
  weekStart: string,
) {
  const supabase = getSupabaseClient();
  const weekEnd = addScheduleDays(weekStart, 6);

  const [factsResult, projectionResult, routesResult, requestsResult, overridesResult] = await Promise.all([
    supabase
      .from("schedule_day_fact_view")
      .select("service_date, roster_member_id, full_name, worker_type, planned_on, route_name, override_type")
      .eq("company_id", context.company_id)
      .gte("service_date", weekStart)
      .lte("service_date", weekEnd)
      .order("service_date"),
    supabase.rpc("resolve_schedule_projection", {
      p_company_id: context.company_id,
      p_start_date: weekStart,
      p_horizon_days: 7,
    }),
    supabase
      .from("route_baseline")
      .select("id, route_name, current_wa_num, runs_s, runs_u, runs_m, runs_t, runs_w, runs_h, runs_f")
      .eq("company_id", context.company_id)
      .eq("is_active", true)
      .is("effective_end", null)
      .order("route_name"),
    supabase
      .from("driver_time_off_request")
      .select("id, roster_member_id, requested_dates, start_date, end_date, day_count, status, request_note, manager_note, submitted_at, reviewed_at")
      .eq("company_id", context.company_id)
      .eq("status", "PENDING")
      .order("submitted_at"),
    supabase
      .from("schedule_override")
      .select("id, roster_member_id, override_type, start_date, end_date, route_name_override, manager_note")
      .eq("company_id", context.company_id)
      .eq("is_active", true)
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart)
      .order("start_date"),
  ]);

  if (factsResult.error) throw factsResult.error;
  if (projectionResult.error) throw projectionResult.error;
  if (routesResult.error) throw routesResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (overridesResult.error) throw overridesResult.error;

  const factRows = (factsResult.data ?? []) as FactRow[];
  const projectionRows = (projectionResult.data ?? []) as ProjectionRow[];
  const requestRows = (requestsResult.data ?? []) as RequestRow[];
  const overrideRows = (overridesResult.data ?? []) as OverrideRow[];
  const knownFactKeys = new Set(
    factRows.map((row) => `${row.service_date}:${row.roster_member_id}`),
  );
  const missingProjectionRows = projectionRows.filter(
    (row) => !knownFactKeys.has(`${row.service_date}:${row.roster_member_id}`),
  );
  const rosterIds = Array.from(new Set([
    ...missingProjectionRows.map((row) => row.roster_member_id),
    ...requestRows.map((row) => row.roster_member_id),
    ...overrideRows.map((row) => row.roster_member_id),
  ])).filter(Boolean);

  let identities = new Map<string, RosterIdentity>();
  if (rosterIds.length > 0) {
    const rosterResult = await supabase
      .from("company_roster_view")
      .select("roster_member_id, full_name, worker_type")
      .eq("company_id", context.company_id)
      .in("roster_member_id", rosterIds);
    if (rosterResult.error) throw rosterResult.error;
    identities = new Map(
      ((rosterResult.data ?? []) as RosterIdentity[]).map((row) => [row.roster_member_id, row]),
    );
  }

  const overrideTypes = new Map(overrideRows.map((row) => [row.id, row.override_type]));
  const rows: ManagerScheduleRow[] = [
    ...factRows.map((row) => ({ ...row, override_type: row.override_type ?? null })),
    ...missingProjectionRows.map((row) => {
      const identity = identities.get(row.roster_member_id);
      return {
        service_date: row.service_date,
        roster_member_id: row.roster_member_id,
        full_name: identity?.full_name ?? null,
        worker_type: identity?.worker_type ?? null,
        planned_on: row.planned_on,
        route_name: row.route_name,
        override_type: row.override_id ? overrideTypes.get(row.override_id) ?? null : null,
      };
    }),
  ];
  const requests: ManagerTimeOffRequest[] = requestRows.map((row) => {
    const identity = identities.get(row.roster_member_id);
    return {
      ...row,
      full_name: cleanName(identity?.full_name),
      worker_type: identity?.worker_type ?? null,
    };
  });
  const overrides: ManagerScheduleOverride[] = overrideRows.map((row) => ({
    ...row,
    full_name: cleanName(identities.get(row.roster_member_id)?.full_name),
  }));

  return buildManagerScheduleSnapshot({
    weekStart,
    routes: (routesResult.data ?? []) as ManagerScheduleRoute[],
    rows,
    requests,
    overrides,
  });
}

export async function reviewManagerTimeOffRequest(params: {
  context: ManagerAccessContext;
  requestId: string;
  decision: "APPROVED" | "DENIED";
  managerNote: string;
}) {
  const result = await getSupabaseClient().rpc("review_driver_time_off_request", {
    p_company_slug: params.context.company_slug,
    p_request_id: params.requestId,
    p_decision: params.decision,
    p_manager_note: params.managerNote.trim().slice(0, 500) || null,
  });
  if (result.error) throw result.error;
  return result.data;
}
