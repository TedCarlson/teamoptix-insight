import type { ManagerAccessContext } from "../domain/access";
import {
  deriveManagerPeopleCompliance,
  validateCandidateStageChange,
  type ManagerCandidateStage,
  type ManagerPeopleInterview,
  type ManagerPeopleSnapshot,
  type ManagerPerson,
} from "../domain/managerPeople";
import { getSupabaseClient } from "../lib/supabase";
import { authoritativeOperationsDate } from "./managerWorkspace";

type RosterRow = {
  roster_member_id: string;
  roster_record_kind: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  worker_type: string | null;
  job_title: string | null;
  employment_status: string | null;
  market_code: string | null;
  reports_to_name: string | null;
  hire_date: string | null;
  separation_date: string | null;
  invite_status: string | null;
  fx_id: string | null;
  dswid: string | null;
};

type CandidateStageRow = {
  roster_id: string;
  stage_key: string | null;
  default_label: string | null;
  is_terminal: boolean | null;
};

type CandidateStageConfigRow = {
  stage_key: string;
  display_label: string | null;
  default_label: string | null;
  is_terminal: boolean | null;
  sort_order: number | null;
  stage_sort_order: number | null;
};

type ChecklistConfigRow = {
  item_type_id: string;
  is_required: boolean;
  readiness_weight: number | string | null;
};

type ChecklistFactRow = {
  roster_id: string;
  item_type_id: string;
  is_complete: boolean;
};

function localDateKey(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function loadManagerPeopleSnapshot(
  context: ManagerAccessContext,
): Promise<ManagerPeopleSnapshot> {
  const canViewRoster = context.grants.includes("roster");
  const canManageHiring = context.grants.includes("hiring");
  if (!canViewRoster && !canManageHiring) throw new Error("People access is not in this role's scope.");

  const supabase = getSupabaseClient();
  const authority = await authoritativeOperationsDate(context);
  const rosterQuery = supabase
    .from("company_roster_view")
    .select("roster_member_id, roster_record_kind, full_name, email, phone, worker_type, job_title, employment_status, market_code, reports_to_name, hire_date, separation_date, invite_status, fx_id, dswid")
    .eq("company_id", context.company_id)
    .order("full_name");

  const [rosterResult, scheduleResult, operationsResult, licenseResult, stageResult, stageConfigResult, checklistConfigResult, checklistFactResult, interviewResult] = await Promise.all([
    rosterQuery,
    canViewRoster
      ? supabase.from("schedule_day_fact_view").select("roster_member_id, planned_on, override_type").eq("company_id", context.company_id).eq("service_date", authority.serviceDate)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("company_roster_operations_fact_v").select("roster_id, dot_exp, qual_cert_exp"),
    supabase.from("company_roster_license_fact_v").select("roster_id, expiration_date").eq("company_id", context.company_id),
    canManageHiring
      ? supabase.from("roster_candidate_stage_v").select("roster_id, stage_key, default_label, is_terminal").eq("company_id", context.company_id)
      : Promise.resolve({ data: [], error: null }),
    canManageHiring
      ? supabase.from("company_candidate_stage_config_v").select("stage_key, display_label, default_label, is_terminal, sort_order, stage_sort_order").eq("company_id", context.company_id).eq("is_enabled", true).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    canManageHiring
      ? supabase.from("company_candidate_checklist_readiness_v").select("item_type_id, is_required, readiness_weight").eq("company_id", context.company_id).eq("is_enabled", true)
      : Promise.resolve({ data: [], error: null }),
    canManageHiring
      ? supabase.from("roster_candidate_checklist_fact_v").select("roster_id, item_type_id, is_complete").eq("company_id", context.company_id)
      : Promise.resolve({ data: [], error: null }),
    canManageHiring
      ? supabase.from("candidate_interviews_v").select("id, first_name, last_name, manual_name, starts_at, interview_status, meeting_provider").eq("company_id", context.company_id).order("starts_at")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = rosterResult.error ?? scheduleResult.error ?? operationsResult.error ?? licenseResult.error
    ?? stageResult.error ?? stageConfigResult.error ?? checklistConfigResult.error ?? checklistFactResult.error ?? interviewResult.error;
  if (error) throw error;

  const roster = (rosterResult.data ?? []) as RosterRow[];
  const operations = new Map((operationsResult.data ?? []).map((row) => [row.roster_id, row]));
  const licenses = new Map((licenseResult.data ?? []).map((row) => [row.roster_id, row]));
  const stagesByRoster = new Map(((stageResult.data ?? []) as CandidateStageRow[]).map((row) => [row.roster_id, row]));
  const requiredWeights = new Map(
    ((checklistConfigResult.data ?? []) as ChecklistConfigRow[])
      .filter((row) => row.is_required)
      .map((row) => [row.item_type_id, Number(row.readiness_weight ?? 1)]),
  );
  const checklistFacts = (checklistFactResult.data ?? []) as ChecklistFactRow[];

  const people: ManagerPerson[] = roster
    .filter((row) => row.roster_record_kind !== "WALK_ON")
    .filter((row) => canViewRoster || row.employment_status === "Candidate")
    .map((row) => {
      const operation = operations.get(row.roster_member_id);
      const license = licenses.get(row.roster_member_id);
      const stage = stagesByRoster.get(row.roster_member_id);
      const candidateFacts = checklistFacts.filter((fact) => fact.roster_id === row.roster_member_id && requiredWeights.has(fact.item_type_id));
      const completedWeight = candidateFacts
        .filter((fact) => fact.is_complete)
        .reduce((sum, fact) => sum + (requiredWeights.get(fact.item_type_id) ?? 1), 0);
      const totalWeight = [...requiredWeights.values()].reduce((sum, weight) => sum + weight, 0);
      return {
        id: row.roster_member_id,
        fullName: row.full_name || "Unnamed team member",
        email: row.email,
        phone: row.phone,
        workerType: row.worker_type,
        jobTitle: row.job_title,
        employmentStatus: row.employment_status || "Unknown",
        marketCode: row.market_code,
        reportsToName: row.reports_to_name,
        hireDate: row.hire_date,
        separationDate: row.separation_date,
        inviteStatus: row.invite_status || "Not Invited",
        rosterRecordKind: row.roster_record_kind || "INTERNAL",
        fxId: row.fx_id,
        dswid: row.dswid,
        candidateStageKey: stage?.stage_key ?? (row.employment_status === "Candidate" ? "candidate_created" : null),
        candidateStageLabel: stage?.default_label ?? (row.employment_status === "Candidate" ? "New" : null),
        candidateStageTerminal: Boolean(stage?.is_terminal),
        candidateProgress: totalWeight ? Math.round((completedWeight / totalWeight) * 100) : 0,
        requiredChecklistComplete: candidateFacts.filter((fact) => fact.is_complete).length,
        requiredChecklistTotal: requiredWeights.size,
        complianceSignals: deriveManagerPeopleCompliance({
          licenseExpirationDate: license?.expiration_date ?? null,
          dotExpirationDate: operation?.dot_exp ?? null,
          qualificationExpirationDate: operation?.qual_cert_exp ?? null,
        }, new Date(`${authority.serviceDate}T12:00:00Z`)),
      };
    });

  const stages: ManagerCandidateStage[] = ((stageConfigResult.data ?? []) as CandidateStageConfigRow[]).map((row) => ({
    key: row.stage_key,
    label: row.display_label || row.default_label || row.stage_key,
    isTerminal: Boolean(row.is_terminal),
    sortOrder: Number(row.sort_order ?? row.stage_sort_order ?? 100),
  }));

  const interviews: ManagerPeopleInterview[] = (interviewResult.data ?? []).map((row) => ({
    id: row.id,
    personName: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.manual_name || "Interviewee",
    startsAt: row.starts_at ?? null,
    status: row.interview_status || "scheduled",
    provider: row.meeting_provider ?? null,
  }));
  const todayInterviews = interviews.filter((interview) => interview.startsAt && localDateKey(interview.startsAt, authority.timeZone) === authority.serviceDate);
  const scheduleRows = scheduleResult.data ?? [];

  return {
    serviceDate: authority.serviceDate,
    timeZone: authority.timeZone,
    canViewRoster,
    canManageHiring,
    scheduledToday: scheduleRows.filter((row) => row.planned_on).length,
    offToday: scheduleRows.filter((row) => !row.planned_on).length,
    timeAwayToday: scheduleRows.filter((row) => row.override_type && row.override_type !== "ADD_IN").length,
    interviewsToday: todayInterviews.length,
    people,
    stages,
    interviews,
  };
}

export async function updateManagerCandidateStage(input: {
  context: ManagerAccessContext;
  snapshot: ManagerPeopleSnapshot;
  rosterMemberId: string;
  stageKey: string;
  note: string;
}) {
  if (!input.context.grants.includes("hiring")) throw new Error("Hiring access is not in this role's scope.");
  const person = input.snapshot.people.find((candidate) => candidate.id === input.rosterMemberId) ?? null;
  const validation = validateCandidateStageChange({ person, stageKey: input.stageKey, stages: input.snapshot.stages });
  if (validation) throw new Error(validation);
  const result = await getSupabaseClient().rpc("candidate_stage_set", {
    p_company_slug: input.context.company_slug,
    p_roster_id: input.rosterMemberId,
    p_stage_key: input.stageKey,
    p_note: input.note.trim() || null,
  });
  if (result.error) throw result.error;
  return result.data;
}
