import type { ManagerAccessContext } from "../domain/access";
import type {
  ManagerOperationsRoute,
  ManagerWorkspaceChildKey,
  ManagerWorkspaceItem,
  ManagerWorkspaceSnapshot,
  ManagerWorkspaceTone,
} from "../domain/managerWorkspace";
import { getSupabaseClient } from "../lib/supabase";
import { authoritativeOperationsDate, loadManagerWorkspaceSnapshot } from "./managerWorkspace";
import { loadManagerWalkOnSnapshot } from "./managerWalkOns";

function dateBy(value: string, delta: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day, 12));
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(numberValue(value));
}

function phaseLabel(route: ManagerOperationsRoute) {
  if (route.phase === "end_of_day") return "End of day";
  if (route.phase === "on_job") return "On job";
  if (route.phase === "unassigned") return "Unassigned";
  return route.phase === "arrived" ? "Arrived" : "Waiting";
}

function phaseTone(route: ManagerOperationsRoute): ManagerWorkspaceTone {
  if (route.phase === "end_of_day") return "success";
  if (route.phase === "unassigned" || route.expressOpen > 0) return "warning";
  return "default";
}

async function loadService(context: ManagerAccessContext): Promise<ManagerWorkspaceSnapshot> {
  const parent = await loadManagerWorkspaceSnapshot(context, "operations");
  const operations = parent.operations;
  const routes = operations?.routes ?? [];
  return {
    metrics: parent.metrics,
    description: "Live route execution, service completion, pickups, and time-critical evidence in a mobile review layer.",
    statusText: operations?.statusText,
    serviceDate: operations?.serviceDate,
    filters: [
      { key: "all", label: "All" },
      { key: "on_job", label: "On job" },
      { key: "end_of_day", label: "End of day" },
      { key: "attention", label: "Attention" },
    ],
    sectionLabel: "Route service",
    items: routes.map((route): ManagerWorkspaceItem => ({
      id: route.id,
      title: route.workArea && !route.routeName.includes(route.workArea)
        ? `${route.routeName} · ${route.workArea}`
        : route.routeName,
      detail: route.driverName || "Driver assignment not available",
      eyebrow: phaseLabel(route),
      filterKeys: [
        route.phase,
        route.phase === "unassigned" || route.expressOpen > 0 ? "attention" : "",
      ].filter(Boolean),
      facts: [
        { label: "Stops", value: `${route.completedStops}/${route.plannedStops || "—"}` },
        { label: "Packages", value: `${route.completedPackages}/${route.plannedPackages || "—"}` },
        { label: "Pickups", value: `${route.completedPickups}/${route.plannedPickups}` },
      ],
      chips: [
        `${route.progressPercent}% complete`,
        route.ilsPercent == null ? "ILS pending" : `${compactNumber(route.ilsPercent)}% ILS`,
        `${route.expressOpen} Express open`,
      ],
      tone: phaseTone(route),
    })),
    emptyMessage: operations
      ? `No route service records are available for ${dateLabel(operations.serviceDate)}.`
      : "No route service records are available.",
    operations,
  };
}

type PlanningRow = {
  batch_id: string | null;
  service_date: string;
  report_frame: string;
  route_baseline_id: string | null;
  route_name: string | null;
  wa_number: string | null;
  stops: number | null;
  packages: number | null;
  time_commits: number | null;
  miles: number | string | null;
  planned_time: number | string | null;
  miles_per_stop: number | string | null;
  minutes_per_stop: number | string | null;
};

async function loadPlanning(context: ManagerAccessContext): Promise<ManagerWorkspaceSnapshot> {
  const authority = await authoritativeOperationsDate(context);
  const planningDate = dateBy(authority.serviceDate, 1);
  const supabase = getSupabaseClient();
  const [todayAm, todayPm, tomorrowPm] = await Promise.all([
    supabase.rpc("get_operations_dro_plan_rows", { p_company_id: context.company_id, p_service_date: authority.serviceDate, p_report_frame: "AM" }),
    supabase.rpc("get_operations_dro_plan_rows", { p_company_id: context.company_id, p_service_date: authority.serviceDate, p_report_frame: "PM" }),
    supabase.rpc("get_operations_dro_plan_rows", { p_company_id: context.company_id, p_service_date: planningDate, p_report_frame: "PM" }),
  ]);
  if (todayAm.error && todayPm.error && tomorrowPm.error) throw todayAm.error;
  const candidates = [
    { rows: (todayAm.error ? [] : todayAm.data ?? []) as PlanningRow[], date: authority.serviceDate, frame: "AM", mode: "Readiness" },
    { rows: (todayPm.error ? [] : todayPm.data ?? []) as PlanningRow[], date: authority.serviceDate, frame: "PM", mode: "Readiness" },
    { rows: (tomorrowPm.error ? [] : tomorrowPm.data ?? []) as PlanningRow[], date: planningDate, frame: "PM", mode: "Planning" },
  ];
  const selected = candidates.find((candidate) => candidate.rows.length) ?? candidates.at(-1)!;
  const rows = selected.rows;
  const serviceDate = selected.date;
  const frame = rows[0]?.report_frame || selected.frame;
  const totals = rows.reduce((value, row) => ({
    stops: value.stops + numberValue(row.stops),
    packages: value.packages + numberValue(row.packages),
    commits: value.commits + numberValue(row.time_commits),
  }), { stops: 0, packages: 0, commits: 0 });
  return {
    metrics: [
      { label: "Routes", value: String(rows.length) },
      { label: "Stops", value: compactNumber(totals.stops) },
      { label: "Packages", value: compactNumber(totals.packages) },
    ],
    description: "Current readiness or next-day route demand, using the same planning-frame priority as the web workspace.",
    statusText: `${selected.mode} · ${frame} frame · ${dateLabel(serviceDate)}${authority.terminalCode ? ` · ${authority.terminalCode} terminal` : ""}`,
    serviceDate,
    sectionLabel: "Projected routes",
    items: rows.map((row, index): ManagerWorkspaceItem => ({
      id: row.route_baseline_id || `${row.route_name || "route"}-${index}`,
      title: [row.route_name, row.wa_number].filter(Boolean).join(" · ") || "Unmatched route",
      detail: `${compactNumber(row.stops)} planned stops · ${compactNumber(row.packages)} packages`,
      eyebrow: `${frame} projection`,
      facts: [
        { label: "Commits", value: compactNumber(row.time_commits) },
        { label: "Miles", value: row.miles == null ? "—" : compactNumber(row.miles) },
        { label: "Min / stop", value: row.minutes_per_stop == null ? "—" : compactNumber(row.minutes_per_stop) },
      ],
      chips: [
        row.miles_per_stop == null ? "Density pending" : `${compactNumber(row.miles_per_stop)} mi/stop`,
        row.planned_time == null ? "Time pending" : `${compactNumber(row.planned_time)} planned hours`,
      ],
    })),
    emptyMessage: `No current readiness or next-day PM planning frame is loaded as of ${dateLabel(authority.serviceDate)}.`,
  };
}

type CalendarRow = { service_date: string; status: string; has_final: boolean };
type SummaryRow = {
  batch_id: string;
  service_date: string;
  source_filename: string | null;
  created_at: string;
  summary_label: string | null;
  terminal_code: string | null;
  route_count: number | null;
  normalized_row_json: Record<string, unknown> | null;
};

async function loadReports(context: ManagerAccessContext, requestedDate?: string): Promise<ManagerWorkspaceSnapshot> {
  const authority = await authoritativeOperationsDate(context);
  const endDate = dateBy(authority.serviceDate, -1);
  const startDate = dateBy(endDate, -45);
  const supabase = getSupabaseClient();
  const calendarResult = await supabase.rpc("get_daily_operations_calendar", {
    p_company_id: context.company_id,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (calendarResult.error) throw calendarResult.error;
  const calendar = (calendarResult.data ?? []) as CalendarRow[];
  const availableDates = calendar.filter((row) => row.has_final).map((row) => row.service_date).sort();
  const serviceDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : availableDates.at(-1) || endDate;
  const summaryResult = await supabase.rpc("get_daily_operations_summary", {
    p_company_id: context.company_id,
    p_service_date: serviceDate,
  });
  if (summaryResult.error) throw summaryResult.error;
  const row = ((summaryResult.data ?? []) as SummaryRow[])[0] ?? null;
  const data = row?.normalized_row_json ?? {};
  const value = (...keys: string[]) => keys.map((key) => data[key]).find((candidate) => candidate != null) ?? 0;
  const routeCount = numberValue(row?.route_count);
  const plannedStops = numberValue(value("planned_delivery_stops"));
  const actualStops = numberValue(value("actual_delivery_stops"));
  const plannedPackages = numberValue(value("vscan_packages", "planned_delivery_packages"));
  const actualPackages = numberValue(value("actual_delivery_packages"));
  const pickups = numberValue(value("actual_pickup_stops"));
  const exceptions = numberValue(value("exceptions", "all_status_code_packages"));
  const ils = numberValue(value("ils_percent"));
  const dna = numberValue(value("dna", "code_85"));
  const items: ManagerWorkspaceItem[] = row ? [
    {
      id: "delivery",
      title: "Delivery completion",
      detail: `${compactNumber(actualStops)} of ${compactNumber(plannedStops)} planned stops completed`,
      eyebrow: "Service outcome",
      facts: [
        { label: "Stops", value: `${compactNumber(actualStops)}/${compactNumber(plannedStops)}` },
        { label: "Packages", value: `${compactNumber(actualPackages)}/${compactNumber(plannedPackages)}` },
        { label: "Pickups", value: compactNumber(pickups) },
      ],
      tone: actualStops >= plannedStops && plannedStops > 0 ? "success" : "warning",
    },
    {
      id: "quality",
      title: "Quality and exceptions",
      detail: "Final DSW quality signals from the selected service date.",
      eyebrow: "Delivery quality",
      facts: [
        { label: "ILS", value: `${compactNumber(ils)}%` },
        { label: "Exceptions", value: compactNumber(exceptions) },
        { label: "DNA / 85", value: compactNumber(dna) },
      ],
      chips: [row.summary_label || "Contract summary", row.terminal_code || authority.terminalCode || "Terminal"],
      tone: exceptions > 0 || dna > 0 ? "warning" : "success",
    },
  ] : [];
  return {
    metrics: [
      { label: "Routes", value: compactNumber(routeCount) },
      { label: "Stops", value: compactNumber(actualStops) },
      { label: "ILS", value: row ? `${compactNumber(ils)}%` : "—", tone: row && ils >= 99 ? "success" : undefined },
    ],
    description: "Final daily operations facts for the selected service date.",
    statusText: row ? `${row.summary_label || "Final DSW summary"} · loaded ${dateLabel(serviceDate)}` : `No final DSW summary · ${dateLabel(serviceDate)}`,
    serviceDate,
    availableDates,
    sectionLabel: "Daily report",
    items,
    emptyMessage: `No final daily operations report is loaded for ${dateLabel(serviceDate)}.`,
  };
}

async function loadWalkOns(context: ManagerAccessContext): Promise<ManagerWorkspaceSnapshot> {
  const walkOns = await loadManagerWalkOnSnapshot(context);
  const assignments = walkOns.people.flatMap((person) => person.assignments);
  const active = walkOns.people.filter((person) => person.status === "ACTIVE");
  const needsPayroll = assignments.filter((assignment) => assignment.status === "ACTIVE" && !assignment.payrollEventId).length;
  return {
    metrics: [
      { label: "Active", value: String(active.length), tone: "success" },
      { label: "Assignments", value: String(assignments.filter((row) => row.assignment_status === "ACTIVE").length) },
      { label: "Needs payroll", value: String(needsPayroll), tone: needsPayroll ? "warning" : "success" },
    ],
    description: "Support identities, source workforce units, dispatch history, and payroll posture.",
    filters: [
      { key: "all", label: "All" },
      { key: "active", label: "Active" },
      { key: "payroll", label: "Needs payroll" },
      { key: "archived", label: "Archived" },
    ],
    sectionLabel: "Walk-on roster",
    items: walkOns.people.map((person): ManagerWorkspaceItem => {
      const latest = person.assignments[0];
      const missingPayroll = person.assignments.some((assignment) => assignment.status === "ACTIVE" && !assignment.payrollEventId);
      const payDetail = !latest
        ? "No dated assignment"
        : !latest.payrollEventId
          ? "Payroll treatment required"
          : latest.payTreatment === "ONE_DAY_RATE"
            ? `One-day · $${numberValue(latest.overrideDailyPayRate).toFixed(2)}`
            : latest.payTreatment === "INTERCOMPANY" ? "Intercompany" : "Roster rate";
      return {
        id: person.id,
        title: person.fullName,
        detail: [person.dswid ? `DSWID ${person.dswid}` : "DSWID unavailable", person.workforceUnitName || "Unit unavailable"].join(" · "),
        eyebrow: person.status === "ACTIVE" ? "Active support" : "Archived",
        meta: `${person.dispatchCount} dispatches`,
        filterKeys: [person.status.toLowerCase(), missingPayroll ? "payroll" : ""].filter(Boolean),
        facts: [
          { label: "Last seen", value: person.lastSeenDate ? dateLabel(person.lastSeenDate) : "—" },
          { label: "Latest day", value: latest?.serviceDate ? dateLabel(latest.serviceDate) : "—" },
          { label: "Pay", value: payDetail },
        ],
        chips: latest?.note ? [latest.note] : [person.firstSeenDate ? `First seen ${dateLabel(person.firstSeenDate)}` : "History pending"],
        tone: missingPayroll ? "warning" : person.status === "ACTIVE" ? "success" : "default",
      };
    }),
    emptyMessage: "No walk-on identities have been recorded for this company.",
    serviceDate: walkOns.serviceDate,
    walkOns,
  };
}

export async function loadManagerOperationsChildSnapshot(
  context: ManagerAccessContext,
  key: Exclude<ManagerWorkspaceChildKey, "dispatch">,
  serviceDate?: string,
): Promise<ManagerWorkspaceSnapshot> {
  if (key === "service") return loadService(context);
  if (key === "planning") return loadPlanning(context);
  if (key === "reports") return loadReports(context, serviceDate);
  return loadWalkOns(context);
}
