import type { ManagerAccessContext } from "../domain/access";
import {
  validateManagerWalkOnAssignment,
  validateManagerWalkOnIdentity,
  type ManagerWalkOnAssignment,
  type ManagerWalkOnAssignmentDraft,
  type ManagerWalkOnIdentityDraft,
  type ManagerWalkOnPerson,
  type ManagerWalkOnSaveResult,
  type ManagerWalkOnSnapshot,
  type ManagerWalkOnWorkforceUnit,
} from "../domain/managerWalkOns";
import { getSupabaseClient } from "../lib/supabase";
import { authoritativeOperationsDate } from "./managerWorkspace";

type WalkOnRow = {
  walk_on_driver_id: string;
  roster_member_id: string;
  full_name: string;
  dswid: string | null;
  workforce_unit_id: string | null;
  workforce_unit_name: string | null;
  first_seen_date: string;
  last_seen_date: string;
  dispatch_count: number | null;
  status: "ACTIVE" | "ARCHIVED";
};

type WorkforceUnitRow = {
  workforce_unit_id: string;
  unit_name: string;
};

type AssignmentRow = {
  assignment_id: string;
  roster_member_id: string;
  service_date: string;
  assignment_status: "ACTIVE" | "REVERSED";
  note: string | null;
  payroll_event_id: string | null;
  payroll_event_status: string | null;
  pay_treatment: "ROSTER_RATE" | "ONE_DAY_RATE" | "INTERCOMPANY" | null;
  override_daily_pay_rate: number | string | null;
};

type WalkOnRpcResult = {
  record_mode?: "WALK_ON" | "CANDIDATE";
  roster_member_id?: string;
  full_name?: string;
  service_date?: string;
  workforce_unit_id?: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assignment(row: AssignmentRow): ManagerWalkOnAssignment {
  return {
    id: row.assignment_id,
    rosterMemberId: row.roster_member_id,
    serviceDate: row.service_date,
    status: row.assignment_status,
    note: row.note,
    payrollEventId: row.payroll_event_id,
    payrollEventStatus: row.payroll_event_status,
    payTreatment: row.pay_treatment,
    overrideDailyPayRate: row.override_daily_pay_rate == null ? null : numberValue(row.override_daily_pay_rate),
  };
}

export async function loadManagerWalkOnSnapshot(
  context: ManagerAccessContext,
): Promise<ManagerWalkOnSnapshot> {
  if (!context.grants.includes("dispatch")) throw new Error("Walk-on management is not in this role's scope.");
  const supabase = getSupabaseClient();
  const [authority, rosterResult, unitsResult, assignmentsResult] = await Promise.all([
    authoritativeOperationsDate(context),
    supabase
      .from("company_walk_on_roster_v")
      .select("walk_on_driver_id, roster_member_id, full_name, dswid, workforce_unit_id, workforce_unit_name, first_seen_date, last_seen_date, dispatch_count, status")
      .eq("company_id", context.company_id)
      .order("full_name"),
    supabase
      .from("company_walk_on_workforce_unit_v")
      .select("workforce_unit_id, unit_name")
      .eq("company_id", context.company_id)
      .eq("status", "ACTIVE")
      .order("unit_name"),
    supabase
      .from("company_walk_on_assignment_v")
      .select("assignment_id, roster_member_id, service_date, assignment_status, note, payroll_event_id, payroll_event_status, pay_treatment, override_daily_pay_rate")
      .eq("company_id", context.company_id)
      .order("service_date", { ascending: false })
      .limit(500),
  ]);
  const error = rosterResult.error ?? unitsResult.error ?? assignmentsResult.error;
  if (error) throw error;

  const assignmentsByRoster = new Map<string, ManagerWalkOnAssignment[]>();
  ((assignmentsResult.data ?? []) as AssignmentRow[]).forEach((row) => {
    const current = assignmentsByRoster.get(row.roster_member_id) ?? [];
    current.push(assignment(row));
    assignmentsByRoster.set(row.roster_member_id, current);
  });

  const people: ManagerWalkOnPerson[] = ((rosterResult.data ?? []) as WalkOnRow[]).map((row) => ({
    id: row.walk_on_driver_id,
    rosterMemberId: row.roster_member_id,
    fullName: row.full_name,
    dswid: row.dswid,
    workforceUnitId: row.workforce_unit_id,
    workforceUnitName: row.workforce_unit_name,
    firstSeenDate: row.first_seen_date,
    lastSeenDate: row.last_seen_date,
    dispatchCount: numberValue(row.dispatch_count),
    status: row.status,
    assignments: assignmentsByRoster.get(row.roster_member_id) ?? [],
  }));
  const workforceUnits: ManagerWalkOnWorkforceUnit[] = ((unitsResult.data ?? []) as WorkforceUnitRow[]).map((row) => ({
    id: row.workforce_unit_id,
    name: row.unit_name,
  }));
  return { serviceDate: authority.serviceDate, people, workforceUnits };
}

export async function saveManagerWalkOnAssignment(
  context: ManagerAccessContext,
  draft: ManagerWalkOnAssignmentDraft,
): Promise<ManagerWalkOnSaveResult> {
  const validation = validateManagerWalkOnAssignment(draft);
  if (validation) throw new Error(validation);
  const supabase = getSupabaseClient();
  const existing = draft.mode === "EXISTING"
    ? await loadManagerWalkOnSnapshot(context).then((snapshot) =>
        snapshot.people.find((person) => person.rosterMemberId === draft.rosterMemberId) ?? null)
    : null;
  if (draft.mode === "EXISTING" && !existing) throw new Error("That walk-on is outside the active company roster.");

  const result = draft.mode === "CANDIDATE"
    ? await supabase.rpc("create_walk_on_roster_candidate", {
        p_company_slug: context.company_slug,
        p_full_name: draft.fullName.trim(),
        p_seen_date: draft.serviceDate,
        p_note: draft.note.trim() || "Candidate created from the Mobile Companion walk-on workflow.",
      })
    : await supabase.rpc("upsert_company_walk_on_roster_member", {
        p_company_slug: context.company_slug,
        p_seen_date: draft.serviceDate,
        p_roster_member_id: draft.mode === "EXISTING" ? draft.rosterMemberId : null,
        p_full_name: draft.mode === "EXISTING" ? null : draft.fullName.trim(),
        p_dswid: draft.mode === "NEW" ? draft.dswid.trim() : null,
        p_workforce_unit_id: draft.workforceUnitId || existing?.workforceUnitId || null,
        p_new_workforce_unit_name: draft.newWorkforceUnitName.trim() || null,
        p_note: draft.note.trim() || "Walk-on assignment recorded from Mobile Companion.",
      });
  if (result.error) throw result.error;
  const data = (result.data ?? {}) as WalkOnRpcResult;
  if (!data.roster_member_id) throw new Error("The walk-on workflow did not return a governed roster identity.");
  return {
    recordMode: data.record_mode === "CANDIDATE" ? "CANDIDATE" : "WALK_ON",
    rosterMemberId: data.roster_member_id,
    fullName: data.full_name || existing?.fullName || draft.fullName.trim(),
    serviceDate: data.service_date || draft.serviceDate,
    workforceUnitId: data.workforce_unit_id ?? draft.workforceUnitId ?? existing?.workforceUnitId ?? null,
  };
}

export async function manageManagerWalkOnIdentity(
  context: ManagerAccessContext,
  draft: ManagerWalkOnIdentityDraft,
) {
  const validation = validateManagerWalkOnIdentity(draft);
  if (validation) throw new Error(validation);
  const result = await getSupabaseClient().rpc("manage_company_walk_on_roster_member", {
    p_company_slug: context.company_slug,
    p_roster_member_id: draft.rosterMemberId,
    p_full_name: draft.fullName.trim(),
    p_dswid: draft.dswid.trim(),
    p_workforce_unit_id: draft.workforceUnitId,
    p_status: draft.status,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function recordManagerWalkOnAction(
  context: ManagerAccessContext,
  draft: ManagerWalkOnAssignmentDraft,
) {
  const saved = await saveManagerWalkOnAssignment(context, draft);
  const result = await getSupabaseClient().rpc("mobile_companion_record_manager_action", {
    p_company_slug: context.company_slug,
    p_phase: "DISPATCH",
    p_event_code: "ADD_DRIVER",
    p_route_key: null,
    p_route_label: null,
    p_person_roster_member_id: saved.rosterMemberId,
    p_person_name: saved.fullName,
    p_seat: null,
    p_from_route_key: null,
    p_from_route_label: null,
    p_to_route_key: null,
    p_to_route_label: null,
    p_note: draft.note.trim() || null,
    p_stop_count: null,
    p_event_payload: {
      source: "mobile_walk_on_workflow",
      assignment_source: saved.recordMode,
      roster_member_id: saved.rosterMemberId,
      service_date: saved.serviceDate,
      workforce_unit_id: saved.workforceUnitId,
    },
  });
  if (result.error) throw result.error;
  return { saved, event: result.data };
}

