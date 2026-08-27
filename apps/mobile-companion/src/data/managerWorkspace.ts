import type { ManagerAccessContext } from "../domain/access";
import type {
  ManagerOperationsPhase,
  ManagerOperationsRoute,
  ManagerWorkspaceItem,
  ManagerWorkspaceKey,
  ManagerWorkspaceSnapshot,
} from "../domain/managerWorkspace";
import { getSupabaseClient } from "../lib/supabase";
import { loadManagerPeopleSnapshot } from "./managerPeople";
import { loadManagerFleetSnapshot } from "./managerFleet";
import { loadManagerRoutesSnapshot } from "./managerRoutes";
import {
  hasManagerHistoricalFccEvidence,
  managerHistoricalFccPhase,
  managerServiceRouteIdentity,
  resolveManagerServiceDate,
} from "../domain/managerServiceHistory";

function titleCase(value: string | null | undefined) {
  return String(value ?? "Unknown")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactDate(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function completeSnapshot(
  value: Partial<ManagerWorkspaceSnapshot> & Pick<ManagerWorkspaceSnapshot, "sectionLabel">,
): ManagerWorkspaceSnapshot {
  return {
    metrics: value.metrics ?? [],
    sectionLabel: value.sectionLabel,
    items: value.items ?? [],
    emptyMessage: value.emptyMessage ?? "No records are available in this workspace.",
    description: value.description,
    filters: value.filters,
    statusText: value.statusText,
    serviceDate: value.serviceDate,
    maximumServiceDate: value.maximumServiceDate,
    availableDates: value.availableDates,
    operations: value.operations,
    people: value.people,
    fleet: value.fleet,
    routes: value.routes,
  };
}

export async function authoritativeOperationsDate(context: ManagerAccessContext) {
  const result = await getSupabaseClient().rpc("mobile_companion_terminal_time_authority", {
    p_company_slug: context.company_slug,
  });
  if (result.error) throw result.error;
  const authority = (result.data ?? {}) as {
    service_date?: string | null;
    terminal_code?: string | null;
    timezone?: string | null;
  };
  const serviceDate = String(authority.service_date ?? "").trim();
  const timeZone = String(authority.timezone ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !timeZone) {
    throw new Error("The active terminal did not return a valid operating date and timezone.");
  }
  return {
    serviceDate,
    terminalCode: String(authority.terminal_code ?? "").trim() || null,
    timeZone,
  };
}

export async function loadManagerOperationsSnapshot(
  context: ManagerAccessContext,
  requestedDate?: string,
) {
  const authority = await authoritativeOperationsDate(context);
  const serviceDate = resolveManagerServiceDate(requestedDate, authority.serviceDate);
  const historical = serviceDate !== authority.serviceDate;
  const supabase = getSupabaseClient();
  const hasDispatch = context.grants.includes("dispatch");
  const dispatchPromise = hasDispatch
    ? historical
      ? supabase.rpc("get_daily_operations_dispatch_actions", {
          p_company_id: context.company_id,
          p_service_date: serviceDate,
        })
      : supabase.rpc("mobile_companion_dispatch_workspace", {
          p_company_slug: context.company_slug,
        })
    : Promise.resolve({ data: null, error: null });
  const [factsResult, routesResult, dispatchResult, dswResult, fccResult, healthResult] = await Promise.all([
    supabase
      .from("schedule_day_fact_view")
      .select("service_date, roster_member_id, full_name, worker_type, planned_on, route_name, override_type")
      .eq("company_id", context.company_id)
      .eq("service_date", serviceDate),
    supabase
      .from("route_baseline")
      .select("id, route_name, current_wa_num, runs_s, runs_u, runs_m, runs_t, runs_w, runs_h, runs_f")
      .eq("company_id", context.company_id)
      .eq("is_active", true)
      .is("effective_end", null)
      .order("route_name"),
    dispatchPromise,
    supabase.rpc("get_operations_dsw_current_rows", {
      p_company_id: context.company_id,
      p_service_date: serviceDate,
    }),
    historical
      ? supabase.rpc("get_operations_fcc_current_rows", {
          p_company_id: context.company_id,
          p_service_date: serviceDate,
        })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("operations_manifest_route_health_v")
      .select("route_key, route_label, delivery_stop_count, completed_delivery_stop_count, delivery_package_count, express_package_count, completed_express_package_count, attempted_express_package_count, open_express_package_count, pickup_stop_count, pickup_actual_package_count")
      .eq("company_id", context.company_id)
      .eq("service_date", serviceDate),
  ]);
  if (factsResult.error) throw factsResult.error;
  if (routesResult.error) throw routesResult.error;

  type RouteRow = {
    id: string;
    route_name: string | null;
    current_wa_num: string | null;
    runs_s: boolean;
    runs_u: boolean;
    runs_m: boolean;
    runs_t: boolean;
    runs_w: boolean;
    runs_h: boolean;
    runs_f: boolean;
  };
  type DswRow = {
    route_baseline_id?: string | null;
    route_name?: string | null;
    wa_number?: string | null;
    driver_name?: string | null;
    matched_roster_full_name?: string | null;
    vscan_packages?: number | null;
    planned_delivery_stops?: number | null;
    planned_pickup_stops?: number | null;
    actual_delivery_stops?: number | null;
    actual_delivery_packages?: number | null;
    actual_pickup_stops?: number | null;
    ils_percent?: number | string | null;
    generated_at_text?: string | null;
    miles?: number | null;
    normalized_row_json?: {
      miles?: number | null;
      on_road_hours?: string | number | null;
      on_duty_hours?: string | number | null;
    } | null;
  };
  type HealthRow = {
    route_key: string | null;
    route_label: string | null;
    delivery_stop_count: number | null;
    completed_delivery_stop_count: number | null;
    delivery_package_count: number | null;
    express_package_count: number | null;
    completed_express_package_count: number | null;
    attempted_express_package_count: number | null;
    open_express_package_count: number | null;
    pickup_stop_count: number | null;
    pickup_actual_package_count: number | null;
  };
  type FccRow = {
    source_route_key?: string | null;
    source_wa_number?: string | null;
    source_driver_name?: string | null;
    normalized_row_json?: {
      route_baseline_id?: string | null;
      wa_number?: string | null;
      wa_number_normalized?: string | null;
      source_wa_number?: string | null;
      driver_name?: string | null;
      last_delivery_time?: string | null;
      last_pickup_time?: string | null;
      last_transmission_time?: string | null;
      deliveries_complete?: boolean | null;
      pickup_complete?: boolean | null;
      final_stop_time?: string | null;
    } | null;
  };
  type FactRow = {
    full_name: string | null;
    worker_type: string | null;
    planned_on: boolean;
    route_name: string | null;
  };
  const payload = (!historical && !dispatchResult.error ? dispatchResult.data ?? {} : {}) as {
    dispatch_day?: { status?: string | null } | null;
    events?: Array<{
      id: string;
      event_label: string;
      event_category: string;
      event_code?: string | null;
      route_key?: string | null;
      person_name: string | null;
      route_label: string | null;
      from_route_key?: string | null;
      to_route_key?: string | null;
      seat?: string | null;
      note: string | null;
      created_at: string;
      event_payload?: { reverses_event_id?: string | null } | null;
    }>;
  };
  type DispatchEvent = NonNullable<typeof payload.events>[number];
  const rawEvents = (historical
    ? (Array.isArray(dispatchResult.data) ? dispatchResult.data : [])
    : Array.isArray(payload.events) ? payload.events : []) as DispatchEvent[];
  const reversedEventIds = new Set(rawEvents
    .map((event) => event.event_payload?.reverses_event_id)
    .filter((value): value is string => Boolean(value)));
  const events = rawEvents.filter((event) =>
    !reversedEventIds.has(event.id) && !String(event.event_code ?? "").startsWith("UNDO_"),
  );
  const normalizedKey = managerServiceRouteIdentity;
  const numberValue = (value: number | string | null | undefined) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const routeRunsToday = (route: RouteRow) => {
    const [year, month, day] = serviceDate.split("-").map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    const flag: keyof Pick<RouteRow, "runs_s" | "runs_u" | "runs_m" | "runs_t" | "runs_w" | "runs_h" | "runs_f"> =
      weekday === 6 ? "runs_s" : weekday === 0 ? "runs_u" : weekday === 1 ? "runs_m" : weekday === 2 ? "runs_t" : weekday === 3 ? "runs_w" : weekday === 4 ? "runs_h" : "runs_f";
    return Boolean(route[flag]);
  };
  const facts = (factsResult.data ?? []) as FactRow[];
  const dswRows = (dswResult.error ? [] : dswResult.data ?? []) as DswRow[];
  const fccRows = (fccResult.error ? [] : fccResult.data ?? []) as FccRow[];
  const healthRows = (healthResult.error ? [] : healthResult.data ?? []) as HealthRow[];
  const plannedDriverByRoute = new Map<string, string>();
  facts.filter((row) => row.planned_on && row.route_name && row.full_name).forEach((row) => {
    const worker = String(row.worker_type ?? "").toLowerCase();
    if (worker.includes("helper") || worker.includes("trainee") || worker.includes("jumper")) return;
    plannedDriverByRoute.set(normalizedKey(row.route_name), String(row.full_name));
  });
  const dswByKey = new Map<string, DswRow>();
  dswRows.forEach((row) => {
    [row.route_baseline_id, row.route_name, row.wa_number].forEach((value) => {
      const key = normalizedKey(value);
      if (key) dswByKey.set(key, row);
    });
  });
  const fccByKey = new Map<string, FccRow>();
  fccRows.forEach((row) => {
    const evidence = row.normalized_row_json ?? {};
    const score = [
      evidence.last_delivery_time,
      evidence.last_pickup_time,
      evidence.last_transmission_time,
      evidence.final_stop_time,
      evidence.deliveries_complete,
      evidence.pickup_complete,
    ].filter(Boolean).length;
    [
      row.source_route_key,
      row.source_wa_number,
      evidence.route_baseline_id,
      evidence.wa_number,
      evidence.wa_number_normalized,
      evidence.source_wa_number,
    ].forEach((value) => {
      const key = normalizedKey(value);
      if (!key) return;
      const current = fccByKey.get(key)?.normalized_row_json ?? {};
      const currentScore = [
        current.last_delivery_time,
        current.last_pickup_time,
        current.last_transmission_time,
        current.final_stop_time,
        current.deliveries_complete,
        current.pickup_complete,
      ].filter(Boolean).length;
      if (score >= currentScore) fccByKey.set(key, row);
    });
  });
  const healthByKey = new Map<string, HealthRow>();
  healthRows.forEach((row) => {
    const activity = numberValue(row.delivery_package_count) * 100
      + numberValue(row.delivery_stop_count) * 10
      + numberValue(row.pickup_stop_count)
      + numberValue(row.express_package_count);
    [row.route_key, row.route_label].forEach((value) => {
      const key = normalizedKey(value);
      if (!key) return;
      const current = healthByKey.get(key);
      const currentActivity = current
        ? numberValue(current.delivery_package_count) * 100
          + numberValue(current.delivery_stop_count) * 10
          + numberValue(current.pickup_stop_count)
          + numberValue(current.express_package_count)
        : -1;
      if (activity >= currentActivity) healthByKey.set(key, row);
    });
  });
  const configuredRoutes = (routesResult.data ?? []) as RouteRow[];
  const configuredByAlias = new Map<string, RouteRow>();
  configuredRoutes.forEach((route) => {
    [route.id, route.route_name, route.current_wa_num].forEach((value) => {
      const key = normalizedKey(value);
      if (key) configuredByAlias.set(key, route);
    });
  });
  const selectedRouteRows = historical
    ? (() => {
        const selected = new Map<string, RouteRow>();
        const addRoute = (...aliases: Array<string | null | undefined>) => {
          const keys = aliases.map(normalizedKey).filter(Boolean);
          const configured = keys.map((key) => configuredByAlias.get(key)).find(Boolean);
          const routeName = String(aliases.find((value) => String(value ?? "").trim()) ?? "").trim();
          const key = normalizedKey(configured?.id || configured?.current_wa_num || configured?.route_name || routeName);
          if (!key || selected.has(key)) return;
          selected.set(key, configured ?? {
            id: `historical-${key}`,
            route_name: routeName || null,
            current_wa_num: routeName || null,
            runs_s: false,
            runs_u: false,
            runs_m: false,
            runs_t: false,
            runs_w: false,
            runs_h: false,
            runs_f: false,
          });
        };
        dswRows.forEach((row) => addRoute(row.wa_number, row.route_name, row.route_baseline_id));
        fccRows.filter((row) => hasManagerHistoricalFccEvidence(row.normalized_row_json)).forEach((row) => {
          const evidence = row.normalized_row_json ?? {};
          addRoute(row.source_route_key, evidence.wa_number_normalized, evidence.wa_number, row.source_wa_number, evidence.source_wa_number);
        });
        healthRows.forEach((row) => {
          const hasEvidence = numberValue(row.delivery_package_count)
            + numberValue(row.delivery_stop_count)
            + numberValue(row.pickup_stop_count)
            + numberValue(row.express_package_count) > 0;
          if (hasEvidence) addRoute(row.route_key, row.route_label);
        });
        events.forEach((event) => addRoute(event.route_key, event.route_label, event.from_route_key, event.to_route_key));
        return [...selected.values()];
      })()
    : configuredRoutes.filter(routeRunsToday);
  const routeEvents = (route: RouteRow) => {
    const keys = new Set([route.id, route.route_name, route.current_wa_num].map(normalizedKey).filter(Boolean));
    return events.filter((event) => [event.route_key, event.route_label, event.from_route_key, event.to_route_key]
      .map(normalizedKey)
      .some((key) => key && keys.has(key)));
  };
  const routes = selectedRouteRows.map((route): ManagerOperationsRoute => {
    const dsw = [route.id, route.route_name, route.current_wa_num].map(normalizedKey).map((key) => dswByKey.get(key)).find(Boolean);
    const fcc = [route.id, route.route_name, route.current_wa_num].map(normalizedKey).map((key) => fccByKey.get(key)).find(Boolean);
    const fccEvidence = fcc?.normalized_row_json ?? null;
    const health = [route.id, route.route_name, route.current_wa_num].map(normalizedKey).map((key) => healthByKey.get(key)).find(Boolean);
    const relatedEvents = routeEvents(route);
    const eventCodes = relatedEvents.map((event) => `${event.event_code ?? ""} ${event.event_label ?? ""}`.toUpperCase());
    const plannedDriver = [route.route_name, route.current_wa_num].map(normalizedKey).map((key) => plannedDriverByRoute.get(key)).find(Boolean) ?? null;
    const latestDriverEvent = relatedEvents.filter((event) => event.person_name && (!event.seat || event.seat === "driver")).at(-1);
    const driverName = String(dsw?.matched_roster_full_name || dsw?.driver_name || latestDriverEvent?.person_name || plannedDriver || fcc?.source_driver_name || fccEvidence?.driver_name || "").trim() || null;
    const plannedStops = numberValue(dsw?.planned_delivery_stops || health?.delivery_stop_count);
    const completedStops = numberValue(dsw?.actual_delivery_stops || health?.completed_delivery_stop_count);
    const plannedPackages = numberValue(dsw?.vscan_packages || health?.delivery_package_count);
    const completedPackages = numberValue(dsw?.actual_delivery_packages);
    const plannedPickups = numberValue(dsw?.planned_pickup_stops || health?.pickup_stop_count);
    const completedPickups = numberValue(dsw?.actual_pickup_stops || health?.pickup_actual_package_count);
    const normalized = dsw?.normalized_row_json ?? null;
    const returned = (dsw?.miles ?? normalized?.miles) != null && normalized?.on_road_hours != null && normalized?.on_duty_hours != null;
    const historicalFccPhase = historical ? managerHistoricalFccPhase(fccEvidence) : null;
    let phase: ManagerOperationsPhase = driverName ? "waiting" : "unassigned";
    if (returned || (plannedPackages > 0 && completedPackages >= plannedPackages && (plannedPickups === 0 || completedPickups >= plannedPickups))) phase = "end_of_day";
    else if (driverName && (completedStops > 0 || completedPackages > 0 || completedPickups > 0 || dsw?.driver_name)) phase = "on_job";
    else if (historicalFccPhase) phase = historicalFccPhase;
    else if (eventCodes.some((value) => /DISPATCH|DEPART|ON.?ROAD/.test(value)) || (!historical && payload.dispatch_day?.status === "LOCKED")) phase = "on_job";
    else if (eventCodes.some((value) => /ARRIV/.test(value))) phase = "arrived";
    const rawIls = dsw?.ils_percent == null || dsw.ils_percent === "" ? null : Number(String(dsw.ils_percent).replace("%", ""));
    const ilsPercent = rawIls == null || !Number.isFinite(rawIls) ? null : rawIls <= 1 ? rawIls * 100 : rawIls;
    const progressPercent = plannedStops > 0 ? Math.min(100, Math.round((completedStops / plannedStops) * 100)) : 0;
    return {
      id: route.id,
      routeName: route.route_name || route.current_wa_num || "Unnamed route",
      workArea: route.current_wa_num,
      driverName,
      phase,
      completedStops,
      plannedStops,
      completedPackages,
      plannedPackages,
      completedPickups,
      plannedPickups,
      expressComplete: numberValue(health?.completed_express_package_count),
      expressAttempted: numberValue(health?.attempted_express_package_count),
      expressOpen: numberValue(health?.open_express_package_count),
      expressTotal: numberValue(health?.express_package_count),
      ilsPercent,
      progressPercent,
      evidenceSource: dsw ? "DSW" : fccEvidence && hasManagerHistoricalFccEvidence(fccEvidence) ? "FCC" : health ? "Manifest" : relatedEvents.length ? "Dispatch" : undefined,
      lastDeliveryTime: fccEvidence?.last_delivery_time ?? null,
      lastPickupTime: fccEvidence?.last_pickup_time ?? null,
      lastTransmissionTime: fccEvidence?.last_transmission_time ?? null,
    };
  });
  const onJob = routes.filter((route) => route.phase === "on_job").length;
  const endOfDay = routes.filter((route) => route.phase === "end_of_day").length;
  const generatedAt = dswRows.map((row) => row.generated_at_text).filter(Boolean).at(0);
  const evidenceState = historical
    ? `Historical route evidence · ${compactDate(serviceDate)}`
    : dswResult.error && healthResult.error
    ? "Schedule plan · live volume temporarily unavailable"
    : dswResult.error
      ? "Route plan · current DSW volume temporarily unavailable"
      : healthResult.error
        ? "Current DSW volume · Express evidence temporarily unavailable"
        : generatedAt
          ? `Current route evidence · ${generatedAt}`
          : "Current route evidence";
  return completeSnapshot({
    metrics: [
      { label: "Routes", value: String(routes.length) },
      { label: "On job", value: String(onJob) },
      { label: "End of day", value: String(endOfDay), tone: "success" },
    ],
    sectionLabel: "Route operations",
    items: [],
    emptyMessage: `No operating routes are scheduled for ${compactDate(serviceDate)}.`,
    operations: {
      serviceDate,
      liveServiceDate: authority.serviceDate,
      historical,
      statusText: evidenceState,
      terminalCode: authority.terminalCode,
      timeZone: authority.timeZone,
      routes,
    },
  });
}

async function loadPeople(context: ManagerAccessContext) {
  const people = await loadManagerPeopleSnapshot(context);
  const active = people.people.filter((person) => person.employmentStatus === "Active");
  const drivers = active.filter((person) => /driver/i.test(`${person.workerType ?? ""} ${person.jobTitle ?? ""}`));
  const trainees = people.people.filter((person) => person.employmentStatus === "Trainee");
  const candidates = people.people.filter((person) => person.employmentStatus === "Candidate" && !person.candidateStageTerminal);
  return completeSnapshot({
    metrics: [
      { label: "Active drivers", value: String(drivers.length || active.length), tone: "success" },
      { label: "Trainees", value: String(trainees.length), tone: trainees.length ? "warning" : "default" },
      { label: "Candidates", value: String(candidates.length) },
    ],
    description: "Today's workforce briefing, searchable roster, lifecycle detail, compliance, and hiring pipeline.",
    sectionLabel: "Workforce roster",
    people,
    emptyMessage: "No roster members are available.",
  });
}

async function loadFleet(context: ManagerAccessContext) {
  const fleet = await loadManagerFleetSnapshot(context);
  return completeSnapshot({
    metrics: [
      { label: "Units", value: String(fleet.totalVehicles) },
      { label: "Dispatch ready", value: String(fleet.dispatchReady), tone: "success" },
      { label: "Open issues", value: String(fleet.openDefects + fleet.openWorkOrders), tone: fleet.openDefects + fleet.openWorkOrders ? "danger" : "success" },
    ],
    description: "Dispatch readiness, assignment, inspection, and maintenance posture by unit.",
    sectionLabel: "Fleet units",
    fleet,
    emptyMessage: "No active fleet vehicles are available.",
  });
}

async function loadRoutes(context: ManagerAccessContext) {
  const routes = await loadManagerRoutesSnapshot(context);
  return completeSnapshot({
    metrics: [
      { label: "Active routes", value: String(routes.activeRoutes.length) },
      { label: "Core", value: String(routes.coreCount), tone: "success" },
      { label: "Thresholds", value: String(routes.thresholdCount) },
    ],
    description: "Current route baseline, run pattern, location, rotation, and threshold posture.",
    sectionLabel: "Route baseline",
    routes,
    emptyMessage: "No active route baselines are available.",
  });
}

async function loadMessages(context: ManagerAccessContext) {
  const result = await getSupabaseClient()
    .from("company_message")
    .select("id, title, body, status, visibility, requires_ack, published_at, created_at, updated_at")
    .eq("company_id", context.company_id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (result.error) throw result.error;
  const rows = result.data ?? [];
  return completeSnapshot({
    metrics: [
      { label: "Published", value: String(rows.filter((row) => row.status === "published").length), tone: "success" },
      { label: "Drafts", value: String(rows.filter((row) => row.status !== "published").length) },
      { label: "Requires read", value: String(rows.filter((row) => row.requires_ack).length), tone: "warning" },
    ],
    description: "Operational updates and notices by lifecycle, audience, and acknowledgment requirement.",
    filters: [
      { key: "all", label: "All" },
      { key: "published", label: "Published" },
      { key: "draft", label: "Drafts" },
      { key: "ack", label: "Ack required" },
    ],
    sectionLabel: "Message board",
    items: rows.map((row): ManagerWorkspaceItem => ({
      id: row.id,
      title: row.title,
      detail: row.body || (row.requires_ack ? "Acknowledgment required" : "Company update"),
      eyebrow: titleCase(row.status),
      filterKeys: [row.status, row.requires_ack ? "ack" : ""].filter(Boolean),
      facts: [
        { label: "Audience", value: titleCase(row.visibility) },
        { label: "Acknowledgment", value: row.requires_ack ? "Required" : "Not required" },
        { label: row.status === "published" ? "Published" : "Updated", value: compactDate(row.status === "published" ? row.published_at : row.updated_at) },
      ],
      chips: [titleCase(row.visibility), row.requires_ack ? "Ack required" : "Read only"],
      meta: `${titleCase(row.status)} · ${compactDate(row.published_at ?? row.created_at)}`,
      tone: row.status === "published" ? "success" : "warning",
    })),
    emptyMessage: "No company messages have been created.",
  });
}

async function loadAdmin(context: ManagerAccessContext) {
  const grants = [
    context.grants.includes("admin_config") ? "Company configuration" : null,
    context.grants.includes("grant_management") ? "Access management" : null,
    context.grants.includes("payroll") ? "Payroll" : null,
    context.grants.includes("opportunity_analysis") ? "Opportunity analysis" : null,
  ].filter((value): value is string => Boolean(value));
  const [accessResult, operationsResult] = await Promise.all([
    context.grants.includes("grant_management")
      ? getSupabaseClient().rpc("get_company_access_config", { p_company_slug: context.company_slug })
      : Promise.resolve({ data: null, error: null }),
    context.grants.includes("admin_config")
      ? getSupabaseClient().rpc("get_company_operations_config", { p_company_slug: context.company_slug })
      : Promise.resolve({ data: null, error: null }),
  ]);
  const access = (!accessResult.error && accessResult.data && typeof accessResult.data === "object")
    ? accessResult.data as { people?: Array<{ relationship_type?: string; membership_status?: string; grants?: string[] }>; error?: string }
    : null;
  const people = Array.isArray(access?.people) ? access.people : [];
  const operations = (!operationsResult.error && operationsResult.data && typeof operationsResult.data === "object")
    ? operationsResult.data as { route_sort_key?: string; route_sort_direction?: string; timekeeping_oversight_mode?: string }
    : null;
  return completeSnapshot({
    metrics: [
      { label: "Role", value: context.relationship_type === "admin" ? "Admin" : "Manager" },
      { label: "Company users", value: people.length ? String(people.length) : "—" },
      { label: "Your grants", value: String(context.grants.length) },
    ],
    description: "Company identity, leadership authority, workspace access, and operating preferences.",
    filters: [
      { key: "all", label: "All" },
      { key: "config", label: "Configuration" },
      { key: "access", label: "Access" },
    ],
    sectionLabel: "Administrative posture",
    items: [
      {
        id: "company",
        title: context.company_name,
        detail: context.company_slug,
        eyebrow: "Company identity",
        filterKeys: ["config"],
        facts: [
          { label: "Relationship", value: titleCase(context.relationship_type) },
          { label: "Admin tools", value: String(grants.length) },
          { label: "Access", value: context.relationship_type === "admin" ? "Company administrator" : "Grant matched" },
        ],
        chips: grants,
        tone: "success" as const,
      },
      {
        id: "access",
        title: "Workspace access",
        detail: people.length ? `${people.filter((person) => person.membership_status === "active").length} active company users` : access?.error || "Access roster is not in this role's scope",
        eyebrow: "Governed access",
        filterKeys: ["access"],
        facts: [
          { label: "Users", value: people.length ? String(people.length) : "—" },
          { label: "Administrators", value: people.length ? String(people.filter((person) => person.relationship_type === "admin").length) : "—" },
          { label: "Active", value: people.length ? String(people.filter((person) => person.membership_status === "active").length) : "—" },
        ],
        chips: [context.grants.includes("grant_management") ? "Grant management enabled" : "Read only"],
      },
      {
        id: "operations-config",
        title: "Operations preferences",
        detail: "Route ordering and timekeeping oversight lifecycle",
        eyebrow: "Configuration",
        filterKeys: ["config"],
        facts: [
          { label: "Route sort", value: operations?.route_sort_key ? titleCase(operations.route_sort_key) : "—" },
          { label: "Direction", value: operations?.route_sort_direction ? operations.route_sort_direction.toUpperCase() : "—" },
          { label: "Timekeeping", value: operations?.timekeeping_oversight_mode ? titleCase(operations.timekeeping_oversight_mode) : "—" },
        ],
        chips: ["Terminal governed", "Company scoped"],
      },
    ],
    emptyMessage: "No administrative workspaces are in scope.",
  });
}

export async function loadManagerWorkspaceSnapshot(
  context: ManagerAccessContext,
  key: ManagerWorkspaceKey,
  serviceDate?: string,
): Promise<ManagerWorkspaceSnapshot> {
  if (key === "operations") return loadManagerOperationsSnapshot(context, serviceDate);
  if (key === "people") return loadPeople(context);
  if (key === "fleet") return loadFleet(context);
  if (key === "routes") return loadRoutes(context);
  if (key === "messages") return loadMessages(context);
  return loadAdmin(context);
}
