import type { ManagerAccessContext } from "../domain/access";
import {
  addScheduleDays,
  buildManagerScheduleSnapshot,
  type ManagerScheduleBaseline,
  type ManagerScheduleOverride,
  type ManagerSchedulePreset,
  type ManagerScheduleRoute,
  type ManagerScheduleRosterMember,
  type ManagerScheduleRow,
  type ManagerTimeOffRequest,
} from "../domain/managerSchedule";
import { getSupabaseClient } from "../lib/supabase";

type FactRow = Omit<ManagerScheduleRow, "employment_status" | "override_type"> & {
  override_type?: string | null;
};

type ProjectionRow = {
  service_date: string;
  roster_member_id: string;
  planned_on: boolean;
  route_name: string | null;
  override_id: string | null;
};

type RosterIdentity = ManagerScheduleRosterMember;

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
  const horizonDays = 42;
  const weekEnd = addScheduleDays(weekStart, horizonDays - 1);

  const [
    factsResult,
    projectionResult,
    routesResult,
    requestsResult,
    overridesResult,
    rosterResult,
    baselinesResult,
    presetsResult,
  ] = await Promise.all([
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
      p_horizon_days: horizonDays,
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
    supabase
      .from("company_roster_view")
      .select("roster_member_id, full_name, worker_type, employment_status")
      .eq("company_id", context.company_id)
      .in("employment_status", ["Active", "Trainee"])
      .order("full_name"),
    supabase
      .from("schedule_baseline")
      .select("id, roster_member_id, preset_id, rotation_mode, anchor_date, effective_start, rotation_works_s, rotation_works_u, rotation_works_m, rotation_works_t, rotation_works_w, rotation_works_h, rotation_works_f, default_route_s, default_route_u, default_route_m, default_route_t, default_route_w, default_route_h, default_route_f")
      .eq("company_id", context.company_id)
      .eq("is_active", true)
      .is("effective_end", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("schedule_preset")
      .select("id, preset_code, works_s, works_u, works_m, works_t, works_w, works_h, works_f, uses_rotation")
      .eq("company_id", context.company_id)
      .eq("is_active", true)
      .order("preset_code"),
  ]);

  if (factsResult.error) throw factsResult.error;
  if (projectionResult.error) throw projectionResult.error;
  if (routesResult.error) throw routesResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (overridesResult.error) throw overridesResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (baselinesResult.error) throw baselinesResult.error;
  if (presetsResult.error) throw presetsResult.error;

  const factRows = (factsResult.data ?? []) as FactRow[];
  const projectionRows = (projectionResult.data ?? []) as ProjectionRow[];
  const requestRows = (requestsResult.data ?? []) as RequestRow[];
  const overrideRows = (overridesResult.data ?? []) as OverrideRow[];
  const rosterRows = (rosterResult.data ?? []) as RosterIdentity[];
  const knownFactKeys = new Set(
    factRows.map((row) => `${row.service_date}:${row.roster_member_id}`),
  );
  const missingProjectionRows = projectionRows.filter(
    (row) => !knownFactKeys.has(`${row.service_date}:${row.roster_member_id}`),
  );
  const identities = new Map(
    rosterRows.map((row) => [row.roster_member_id, row]),
  );

  const overrideTypes = new Map(overrideRows.map((row) => [row.id, row.override_type]));
  const rows: ManagerScheduleRow[] = [
    ...factRows.map((row) => ({
      ...row,
      employment_status: identities.get(row.roster_member_id)?.employment_status ?? null,
      override_type: row.override_type ?? null,
    })),
    ...missingProjectionRows.map((row) => {
      const identity = identities.get(row.roster_member_id);
      return {
        service_date: row.service_date,
        roster_member_id: row.roster_member_id,
        full_name: identity?.full_name ?? null,
        worker_type: identity?.worker_type ?? null,
        employment_status: identity?.employment_status ?? null,
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
    horizonDays,
    routes: (routesResult.data ?? []) as ManagerScheduleRoute[],
    rows,
    requests,
    overrides,
    roster: rosterRows,
    baselines: (baselinesResult.data ?? []) as ManagerScheduleBaseline[],
    presets: (presetsResult.data ?? []) as ManagerSchedulePreset[],
  });
}

export type ManagerScheduleBaselineDraft = {
  rosterMemberId: string;
  presetId: string | null;
  rotationMode: string;
  effectiveStart: string;
  anchorDate: string;
  rotationWorks: Record<"s" | "u" | "m" | "t" | "w" | "h" | "f", boolean>;
  defaultRoutes: Record<"s" | "u" | "m" | "t" | "w" | "h" | "f", string>;
};

export type ManagerScheduleOverrideDraft = {
  id?: string | null;
  rosterMemberId: string;
  overrideType: string;
  startDate: string;
  endDate: string;
  managerNote: string;
};

export type ManagerSchedulePresetDraft = {
  id?: string | null;
  presetCode: string;
  works: Record<"s" | "u" | "m" | "t" | "w" | "h" | "f", boolean>;
  usesRotation: boolean;
};

const clean = (value: string | null | undefined) => value?.trim() || null;

export async function commitManagerSchedule(context: ManagerAccessContext, startDate: string, horizonDays = 70) {
  const result = await getSupabaseClient().rpc("paint_schedule_day_fact_for_company", {
    p_company_id: context.company_id,
    p_start_date: startDate,
    p_horizon_days: horizonDays,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function saveManagerScheduleBaseline(context: ManagerAccessContext, draft: ManagerScheduleBaselineDraft) {
  const supabase = getSupabaseClient();
  const existing = await supabase
    .from("schedule_baseline")
    .select("id")
    .eq("company_id", context.company_id)
    .eq("roster_member_id", draft.rosterMemberId)
    .eq("is_active", true)
    .is("effective_end", null)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const payload = {
    company_id: context.company_id,
    roster_member_id: draft.rosterMemberId,
    preset_id: draft.presetId,
    rotation_mode: clean(draft.rotationMode) ?? "NONE",
    effective_start: clean(draft.effectiveStart),
    anchor_date: clean(draft.anchorDate) ?? clean(draft.effectiveStart),
    rotation_works_s: draft.rotationWorks.s,
    rotation_works_u: draft.rotationWorks.u,
    rotation_works_m: draft.rotationWorks.m,
    rotation_works_t: draft.rotationWorks.t,
    rotation_works_w: draft.rotationWorks.w,
    rotation_works_h: draft.rotationWorks.h,
    rotation_works_f: draft.rotationWorks.f,
    default_route_s: clean(draft.defaultRoutes.s),
    default_route_u: clean(draft.defaultRoutes.u),
    default_route_m: clean(draft.defaultRoutes.m),
    default_route_t: clean(draft.defaultRoutes.t),
    default_route_w: clean(draft.defaultRoutes.w),
    default_route_h: clean(draft.defaultRoutes.h),
    default_route_f: clean(draft.defaultRoutes.f),
    is_active: true,
    effective_end: null,
  };
  const write = existing.data?.id
    ? await supabase.from("schedule_baseline").update(payload).eq("id", existing.data.id)
    : await supabase.from("schedule_baseline").insert(payload);
  if (write.error) throw write.error;
  return commitManagerSchedule(context, draft.effectiveStart, 70);
}

export async function removeManagerScheduleBaseline(context: ManagerAccessContext, rosterMemberId: string, effectiveEnd: string) {
  const result = await getSupabaseClient().from("schedule_baseline").update({
    is_active: false,
    effective_end: effectiveEnd,
  }).eq("company_id", context.company_id).eq("roster_member_id", rosterMemberId).eq("is_active", true).is("effective_end", null);
  if (result.error) throw result.error;
  return commitManagerSchedule(context, effectiveEnd, 70);
}

export async function saveManagerScheduleOverride(context: ManagerAccessContext, draft: ManagerScheduleOverrideDraft) {
  const supabase = getSupabaseClient();
  const payload = {
    company_id: context.company_id,
    terminal_id: "00000000-0000-0000-0000-000000000000",
    roster_member_id: draft.rosterMemberId,
    override_type: draft.overrideType,
    start_date: draft.startDate,
    end_date: draft.endDate,
    manager_note: clean(draft.managerNote),
    is_active: true,
  };
  const write = draft.id
    ? await supabase.from("schedule_override").update(payload).eq("id", draft.id).eq("company_id", context.company_id)
    : await supabase.from("schedule_override").insert(payload);
  if (write.error) throw write.error;
  return commitManagerSchedule(context, draft.startDate, 70);
}

export async function deactivateManagerScheduleOverride(context: ManagerAccessContext, id: string, startDate: string) {
  const result = await getSupabaseClient().from("schedule_override").update({ is_active: false }).eq("id", id).eq("company_id", context.company_id);
  if (result.error) throw result.error;
  return commitManagerSchedule(context, startDate, 70);
}

export async function saveManagerSchedulePreset(context: ManagerAccessContext, draft: ManagerSchedulePresetDraft) {
  const supabase = getSupabaseClient();
  const payload = {
    company_id: context.company_id,
    preset_code: draft.presetCode.trim().toUpperCase(),
    works_s: draft.works.s,
    works_u: draft.works.u,
    works_m: draft.works.m,
    works_t: draft.works.t,
    works_w: draft.works.w,
    works_h: draft.works.h,
    works_f: draft.works.f,
    uses_rotation: draft.usesRotation,
    is_active: true,
  };
  const write = draft.id
    ? await supabase.from("schedule_preset").update(payload).eq("id", draft.id).eq("company_id", context.company_id)
    : await supabase.from("schedule_preset").insert(payload);
  if (write.error) throw write.error;
}

export async function deactivateManagerSchedulePreset(context: ManagerAccessContext, id: string) {
  const result = await getSupabaseClient().from("schedule_preset").update({ is_active: false }).eq("id", id).eq("company_id", context.company_id);
  if (result.error) throw result.error;
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
