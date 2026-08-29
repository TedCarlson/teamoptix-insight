import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildWorkforceTenureProfile } from "@/features/company/analytics/workforce/workforceTenure";
import { buildResignationNoticeCountdowns } from "@/features/company/analytics/workforce/resignationNotice";
import { summarizeScheduleCoverage } from "@/features/schedule/lib/scheduleCoverageSummary";
import { loadRosterUtilizationRows } from "@/features/people/server/loadRosterUtilizationRows";
import { loadScheduleCoverageRows } from "@/features/schedule/server/loadScheduleCoverageRows";

export const runtime = "nodejs";

type MilestoneKey = "introduced" | "background" | "drug_test" | "medical_card" | "trainer_seat" | "driver_seat";
const milestoneOrder: MilestoneKey[] = ["introduced", "background", "drug_test", "medical_card", "trainer_seat", "driver_seat"];
const milestoneLabels: Record<MilestoneKey, string> = { introduced: "Introduced to pipeline", background: "Background cleared", drug_test: "Drug test cleared", medical_card: "Medical card cleared", trainer_seat: "Trainer seat", driver_seat: "Active driver" };

function classifyChecklist(itemKey: string, label: string): MilestoneKey | null {
  const value = `${itemKey} ${label}`.toLowerCase().replaceAll("-", "_");
  if (value.includes("background")) return "background";
  if (value.includes("drug") || value.includes("dt_")) return "drug_test";
  if (value.includes("medical") || value.includes("med_card") || value.includes("dot_card")) return "medical_card";
  if (value.includes("trainer") || value.includes("training") || value.includes("road_test")) return "trainer_seat";
  return null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: company, error: companyError } = await supabase.from("companies").select("id").eq("company_slug", slug).single();
    if (companyError || !company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

    const requestedAsOf = request.nextUrl.searchParams.get("as_of");
    const asOfDate = requestedAsOf && /^\d{4}-\d{2}-\d{2}$/.test(requestedAsOf)
      ? requestedAsOf
      : new Date().toISOString().slice(0, 10);
    const coverageEndDate = addDays(asOfDate, 13);

    const [rosterResult, configResult, factsResult, stagesResult, eventsResult, noticeResult, routesResult, scheduleResult] = await Promise.all([
      loadRosterUtilizationRows({
        supabase,
        companyId: company.id,
        companySlug: slug,
      }),
      supabase.from("company_candidate_checklist_config_v").select("item_type_id, item_key, display_label, default_label").eq("company_id", company.id),
      supabase.from("roster_candidate_checklist_fact_v").select("roster_id, item_type_id, is_complete").eq("company_id", company.id),
      supabase.from("roster_candidate_stage_v").select("roster_id, stage_key, default_label, is_terminal").eq("company_id", company.id),
      supabase.from("company_roster_event_view").select("roster_id, event_type, event_metadata").eq("company_id", company.id).in("event_type", ["candidate_created", "candidate_checklist_item_completed", "marked_trainee", "marked_active"]),
      supabase.from("schedule_override").select("id, roster_member_id, override_type, start_date, end_date, separation_effective_date, workflow_status, is_active").eq("company_id", company.id).eq("override_type", "RESIGNATION_NOTICE").eq("is_active", true),
      supabase.from("route_baseline").select("id, route_name, current_wa_num, runs_s, runs_u, runs_m, runs_t, runs_w, runs_h, runs_f").eq("company_id", company.id).eq("is_active", true).is("effective_end", null),
      loadScheduleCoverageRows({
        supabase,
        companyId: company.id,
        startDate: asOfDate,
        endDate: coverageEndDate,
      }),
    ]);
    const readError = rosterResult.error || configResult.error || factsResult.error || stagesResult.error || eventsResult.error || noticeResult.error || routesResult.error || scheduleResult.error;
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const roster = rosterResult.data ?? [];
    const stages = stagesResult.data ?? [];
    const facts = factsResult.data ?? [];
    const events = eventsResult.data ?? [];
    const tenure = buildWorkforceTenureProfile(roster, asOfDate);
    const noticeAsOf = new Date().toISOString().slice(0, 10);
    const noticeResignations = buildResignationNoticeCountdowns(
      noticeResult.data ?? [],
      roster,
      noticeAsOf
    );
    const candidateIds = new Set(
      roster
        .filter((row) => row.employment_status === "Candidate")
        .map((row) => row.roster_member_id)
    );
    const onboardingCandidateIds = new Set(
      stages
        .filter((row) => candidateIds.has(row.roster_id) && !row.is_terminal && row.stage_key === "onboarding")
        .map((row) => row.roster_id)
    );
    const milestoneByItemId = new Map<string, MilestoneKey>();
    for (const config of configResult.data ?? []) {
      const milestone = classifyChecklist(String(config.item_key ?? ""), String(config.display_label ?? config.default_label ?? ""));
      if (milestone) milestoneByItemId.set(String(config.item_type_id), milestone);
    }

    const introducedIds = new Set<string>();
    roster.filter((row) => row.employment_status === "Candidate").forEach((row) => introducedIds.add(row.roster_member_id));
    stages.forEach((row) => introducedIds.add(row.roster_id));
    facts.forEach((row) => introducedIds.add(row.roster_id));
    events.forEach((row) => introducedIds.add(row.roster_id));

    const actualByRoster = new Map<string, Set<MilestoneKey>>();
    const actual = (rosterId: string) => {
      if (!actualByRoster.has(rosterId)) actualByRoster.set(rosterId, new Set(["introduced"]));
      return actualByRoster.get(rosterId)!;
    };
    introducedIds.forEach((id) => actual(id));
    for (const fact of facts) {
      if (!fact.is_complete) continue;
      const milestone = milestoneByItemId.get(String(fact.item_type_id));
      if (milestone) actual(fact.roster_id).add(milestone);
    }
    for (const event of events) {
      if (event.event_type === "marked_trainee") actual(event.roster_id).add("trainer_seat");
      if (event.event_type === "marked_active") actual(event.roster_id).add("driver_seat");
    }
    for (const row of roster) {
      if (!introducedIds.has(row.roster_member_id)) continue;
      if (row.employment_status === "Trainee") actual(row.roster_member_id).add("trainer_seat");
      if (row.employment_status === "Active") actual(row.roster_member_id).add("driver_seat");
    }

    const reachedByRoster = new Map<string, Set<MilestoneKey>>();
    for (const rosterId of introducedIds) {
      const observed = actual(rosterId);
      const furthest = Math.max(...Array.from(observed).map((key) => milestoneOrder.indexOf(key)));
      reachedByRoster.set(rosterId, new Set(milestoneOrder.slice(0, furthest + 1)));
    }

    const checkpoints = milestoneOrder.map((key, index) => {
      const reached = Array.from(introducedIds).filter((id) => reachedByRoster.get(id)?.has(key)).length;
      const observed = Array.from(introducedIds).filter((id) => actual(id).has(key)).length;
      const priorReached = index === 0 ? reached : Array.from(introducedIds).filter((id) => reachedByRoster.get(id)?.has(milestoneOrder[index - 1])).length;
      return { key, label: milestoneLabels[key], reached, observed, inferred: Math.max(0, reached - observed), lifecycle_conversion: introducedIds.size ? Math.round((reached / introducedIds.size) * 100) : 0, step_conversion: priorReached ? Math.round((reached / priorReached) * 100) : 0 };
    });

    const activeDrivers = roster.filter(
      (row) => row.employment_status === "Active" && row.driver_program
    );
    const driverUtilization = {
      full_time: activeDrivers.filter((row) => row.driver_utilization_category === "FULL_TIME").length,
      part_time: activeDrivers.filter((row) => row.driver_utilization_category === "PART_TIME").length,
      unscheduled: activeDrivers.filter((row) => row.driver_utilization_category === "UNSCHEDULED").length,
      avp: activeDrivers.filter((row) => row.driver_program === "AVP").length,
      route_day_equivalents: activeDrivers.reduce(
        (sum, row) => sum + Number(row.route_utilization_ratio ?? 0),
        0
      ),
      full_time_day_threshold: Number(activeDrivers[0]?.driver_full_time_day_threshold ?? 5),
    };
    const scheduleCoverage = summarizeScheduleCoverage({
      startDate: asOfDate,
      endDate: coverageEndDate,
      routes: routesResult.data ?? [],
      scheduleRows: scheduleResult.data ?? [],
    });

    const failures = new Map<string, { label: string; count: number; reasons: Record<string, number> }>();
    for (const stage of stages.filter((item) => item.is_terminal)) {
      const reached = reachedByRoster.get(stage.roster_id) ?? new Set<MilestoneKey>(["introduced"]);
      const furthest = Math.max(...Array.from(reached).map((key) => milestoneOrder.indexOf(key)));
      const next = milestoneOrder[Math.min(furthest + 1, milestoneOrder.length - 1)];
      const key = furthest >= milestoneOrder.length - 1 ? "After activation" : `Before ${milestoneLabels[next]}`;
      const current = failures.get(key) ?? { label: key, count: 0, reasons: {} };
      current.count += 1;
      const reason = String(stage.default_label ?? stage.stage_key ?? "Terminal outcome");
      current.reasons[reason] = (current.reasons[reason] ?? 0) + 1;
      failures.set(key, current);
    }

    return NextResponse.json({
      introduced: introducedIds.size,
      onboarding_candidates: onboardingCandidateIds.size,
      tenure,
      notice_as_of: noticeAsOf,
      notice_resignations: noticeResignations,
      driver_utilization: driverUtilization,
      schedule_coverage: scheduleCoverage,
      checkpoints,
      failures: Array.from(failures.values()),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare workforce readiness history." }, { status: 500 });
  }
}
