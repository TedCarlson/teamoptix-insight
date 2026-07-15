import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const ACTIVE_REQUEST_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
];
const AUTOMATION_REPORTS = new Set(["DSW", "FCC"]);
const PREVIOUS_DAY_CLOSE_MINUTES = 3 * 60;
const PREVIOUS_DAY_CLOSE_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
  "COMPLETE",
];

function parseTimeToMinutes(time: string | null | undefined) {
  if (!time || typeof time !== "string") return null;
  const match = time.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function zonedDateParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function terminalLocalState(timeZone: string) {
  const parts = zonedDateParts(timeZone);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    todayIso: `${parts.year}-${parts.month}-${parts.day}`,
    currentMinutes: hour * 60 + minute,
  };
}

function addIsoDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function isWithinWindow(currentMinutes: number, startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return true;
  if (start === end) return true;
  if (start < end) {
    return currentMinutes >= start && currentMinutes < end;
  }
  return currentMinutes >= start || currentMinutes < end;
}

type ScheduledManifestAssignment = {
  id: string;
  template_key: string;
  effective_priority: number;
  cadence_minutes: number | null;
  window_preset: string;
  start_time: string | null;
  end_time: string | null;
  last_generated_at: string | null;
  default_payload_json: Record<string, unknown> | null;
  assignment_payload_json: Record<string, unknown> | null;
};

function manifestTargets(assignment: ScheduledManifestAssignment | null) {
  if (!assignment) return [];

  const templatePayload = assignment.default_payload_json ?? {};
  const assignmentPayload = assignment.assignment_payload_json ?? {};
  const configuredTargets = assignmentPayload.targets ?? templatePayload.targets;

  return Array.isArray(configuredTargets) ? configuredTargets : [];
}

function buildRequestPayload(activeRows: any[], manifestAssignment: ScheduledManifestAssignment | null) {
  const firstTargets = manifestTargets(manifestAssignment);
  const activeReports = new Set(
    activeRows.map((row) => String(row?.automation_type ?? "").toUpperCase())
  );
  const cadenceValues = [
    ...activeRows.map((row) => Number(row?.cadence_minutes) || 0),
    ...(manifestAssignment ? [Number(manifestAssignment.cadence_minutes) || 15] : []),
  ].filter((value) => value > 0);

  const legacyTargets = [
    ...(activeReports.has("DSW")
      ? [{
          key: "DSW_DAILY_SERVICE",
          label: "DSW · Daily Service Worksheet",
          artifact_key: "DSW",
          report_family_key: "DSW",
          runner_section: "DAILY_SERVICE",
          expected_filename_match: ["daily service worksheet"],
        }]
      : []),
    ...(activeReports.has("FCC")
      ? [{
          key: "FCC_SERVICE_AREA_STATUS",
          label: "FCC · Service Area Status",
          artifact_key: "FCC",
          report_family_key: "FCC",
          runner_section: "SERVICE",
          expected_filename_match: ["serviceareastatus", "sastatus", "work area summary"],
        }]
      : []),
  ];

  return {
    source: "automation_scheduler",
    preset: "operations_pulse",
    intent: "operations_pulse",
    request_origin: "automation_scheduler",
    collect_scope: "targeted_file_groups",
    control_level: "platform_managed",
    customer_language: "Operations Pulse",
    runner_goal: "keep_operations_current",
    cadence_minutes: cadenceValues.length > 0 ? Math.min(...cadenceValues) : 15,
    ticket_library_assignment_id: manifestAssignment?.id ?? null,
    targets: [...firstTargets, ...legacyTargets],
    windows: [
      ...(manifestAssignment
        ? [{
            report: manifestAssignment.template_key,
            window_preset: manifestAssignment.window_preset,
            start_time: manifestAssignment.start_time,
            end_time: manifestAssignment.end_time,
            cadence_minutes: manifestAssignment.cadence_minutes ?? 15,
          }]
        : []),
      ...activeRows.map((row) => ({
        report: row.automation_type,
        window_preset: row.window_preset,
        start_time: row.start_time,
        end_time: row.end_time,
        cadence_minutes: row.cadence_minutes,
      })),
    ],
  };
}

function buildPreviousDayClosePayload() {
  return {
    source: "teamoptix_automation",
    preset: "daily_historical_sweep",
    intent: "historical_backfill",
    request_origin: "teamoptix_governed_daily_sweep",
    collect_scope: "dsw_only",
    control_level: "platform_managed",
    customer_language: "Daily Historical Sweep",
    runner_goal: "protect_recent_operational_history",
    targets: [
      {
        key: "DSW_DAILY_SERVICE",
        label: "DSW · Daily Service Worksheet",
        artifact_key: "DSW",
        report_family_key: "DSW",
        runner_section: "DAILY_SERVICE",
        expected_filename_match: ["daily service worksheet"],
      },
    ],
  };
}

async function loadScheduledManifestAssignment(params: {
  supabase: any;
  companyId: string;
  currentMinutes: number;
  operationalDate: string;
}) {
  const { supabase, companyId, currentMinutes, operationalDate } = params;
  const { data, error } = await supabase
    .from("company_operations_ticket_assignment_v")
    .select("id,template_key,effective_priority,cadence_minutes,window_preset,start_time,end_time,last_generated_at,assignment_payload_json,template_id,release_order,operational_contract,active_start_date,inactive_end_date")
    .eq("company_id", companyId)
    .eq("ticket_family", "manifest")
    .eq("execution_lane", "operations_collection_request")
    .eq("assignment_status", "active")
    .eq("is_enabled", true)
    .eq("generation_mode", "scheduled")
    .eq("operational_contract", "IN_DAY_OPERATIONS")
    .lte("active_start_date", operationalDate)
    .or(`inactive_end_date.is.null,inactive_end_date.gt.${operationalDate}`)
    .order("release_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!isWithinWindow(currentMinutes, data.start_time, data.end_time)) return null;

  const cadenceMinutes = Number(data.cadence_minutes) || 15;
  if (data.last_generated_at) {
    const elapsed = Date.now() - new Date(data.last_generated_at).getTime();
    if (elapsed < cadenceMinutes * 60_000) return null;
  }

  const { data: template, error: templateError } = await supabase
    .from("operations_ticket_template_v")
    .select("default_payload_json")
    .eq("id", data.template_id)
    .maybeSingle();

  if (templateError) throw new Error(templateError.message);

  return {
    ...data,
    default_payload_json: template?.default_payload_json ?? null,
  } as ScheduledManifestAssignment;
}

async function companyHasPreviousDayClose(params: {
  supabase: any;
  companyId: string;
  serviceDateStart: string;
  serviceDateEnd: string;
}) {
  const {
    supabase,
    companyId,
    serviceDateStart,
    serviceDateEnd,
  } = params;

  const { data, error } = await supabase
    .from("operations_collection_request_v")
    .select("id, request_status")
    .eq("company_id", companyId)
    .eq("request_type", "PREVIOUS_DAY_CLOSE")
    .eq("service_date_start", serviceDateStart)
    .eq("service_date_end", serviceDateEnd)
    .in("request_status", PREVIOUS_DAY_CLOSE_STATUSES)
    .limit(1);

  if (error) throw new Error(error.message);

  return Array.isArray(data) && data.length > 0;
}

async function loadTerminalTimeZone(
  supabase: any,
  companyId: string
) {
  const { data, error } = await supabase
    .from("company_terminal")
    .select("timezone")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return typeof data?.timezone === "string" && data.timezone.trim()
    ? data.timezone.trim()
    : null;
}

async function companyHasActiveRequest(supabase: any, companyId: string) {
  const { data, error } = await supabase
    .from("operations_collection_request_v")
    .select("id")
    .eq("company_id", companyId)
    .in("request_status", ACTIVE_REQUEST_STATUSES)
    .limit(1);

  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

async function companyHasRecentRequest(supabase: any, companySlug: string, cadenceMinutes: number) {
  const { data, error } = await supabase
    .from("operations_collection_request_v")
    .select("created_at")
    .eq("company_slug", companySlug)
    .eq("request_type", "OPERATIONS_PULSE")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const latest = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!latest || !latest.created_at) return false;
  const createdAt = new Date(latest.created_at).getTime();
  return Date.now() - createdAt < cadenceMinutes * 60_000;
}

export async function GET() {
  const startedAt = Date.now();
  const supabase = createSupabaseServiceRoleClient();

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id,company_slug");

  if (companyError) {
    return NextResponse.json({ ok: false, error: companyError.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  const companyRows = Array.isArray(companies) ? companies : [];

  for (const company of companyRows) {
    const companyId = String(company?.id ?? "");
    const companySlug = String(company?.company_slug ?? "");
    if (!companyId || !companySlug) continue;

    try {
      const terminalTimeZone = await loadTerminalTimeZone(
        supabase,
        companyId
      );

      if (!terminalTimeZone) {
        results.push({
          company_slug: companySlug,
          status: "error",
          error: "No active terminal timezone is configured.",
        });
        continue;
      }

      const terminalState = terminalLocalState(terminalTimeZone);
      const manifestAssignment = await loadScheduledManifestAssignment({
        supabase,
        companyId,
        currentMinutes: terminalState.currentMinutes,
        operationalDate: terminalState.todayIso,
      });
      const serviceDateStart = addIsoDays(
        terminalState.todayIso,
        -3
      );
      const serviceDateEnd = addIsoDays(
        terminalState.todayIso,
        -1
      );

      if (
        terminalState.currentMinutes >= PREVIOUS_DAY_CLOSE_MINUTES
      ) {
        const closeExists = await companyHasPreviousDayClose({
          supabase,
          companyId,
          serviceDateStart,
          serviceDateEnd,
        });

        if (!closeExists) {
          if (await companyHasActiveRequest(supabase, companyId)) {
            results.push({
              company_slug: companySlug,
              status: "skipped",
              request_type: "PREVIOUS_DAY_CLOSE",
              reason: "active request exists",
              service_date_start: serviceDateStart,
              service_date_end: serviceDateEnd,
              timezone: terminalTimeZone,
            });
            continue;
          }

          const {
            data: closeRequest,
            error: closeRequestError,
          } = await supabase.rpc(
            "create_operations_collection_request",
            {
              p_company_slug: companySlug,
              p_request_type: "PREVIOUS_DAY_CLOSE",
              p_service_date: null,
              p_service_date_start: serviceDateStart,
              p_service_date_end: serviceDateEnd,
              p_requested_reports: ["DSW"],
              p_priority: 60,
              p_request_payload:
                buildPreviousDayClosePayload(),
            }
          );

          if (closeRequestError) {
            results.push({
              company_slug: companySlug,
              status: "error",
              request_type: "PREVIOUS_DAY_CLOSE",
              error: closeRequestError.message,
            });
            continue;
          }

          results.push({
            company_slug: companySlug,
            status: "created",
            request_id: closeRequest?.id,
            request_type: "PREVIOUS_DAY_CLOSE",
            service_date_start: serviceDateStart,
            service_date_end: serviceDateEnd,
            requested_reports: ["DSW"],
            timezone: terminalTimeZone,
          });
          continue;
        }
      }

      const { data: rows, error: scheduleError } = await supabase.rpc(
        "get_operations_automation_schedule_config",
        { p_company_slug: companySlug }
      );

      if (scheduleError) {
        results.push({ company_slug: companySlug, status: "error", error: scheduleError.message });
        continue;
      }

      const enabledRows = (rows ?? []).filter(
        (row: any) => row?.is_enabled && row?.window_preset !== "OFF"
      );

      const activeRows = enabledRows.filter((row: any) =>
        AUTOMATION_REPORTS.has(row?.automation_type) &&
        isWithinWindow(terminalState.currentMinutes, row?.start_time, row?.end_time)
      );

      if (activeRows.length === 0 && !manifestAssignment) {
        results.push({ company_slug: companySlug, status: "skipped", reason: "no active automation window" });
        continue;
      }

      const requestReports = [...new Set([
        ...(manifestAssignment ? ["FCC"] : []),
        ...activeRows.map((row: any) => String(row.automation_type).toUpperCase()),
      ])].filter(
        (value): value is string => typeof value === "string" && AUTOMATION_REPORTS.has(value)
      );

      if (requestReports.length === 0) {
        results.push({ company_slug: companySlug, status: "skipped", reason: "no supported reports" });
        continue;
      }

      if (await companyHasActiveRequest(supabase, companyId)) {
        results.push({ company_slug: companySlug, status: "skipped", reason: "active request exists" });
        continue;
      }

      const cadenceValues = [
        ...activeRows.map((row: any) => Number(row.cadence_minutes) || 0),
        ...(manifestAssignment ? [Number(manifestAssignment.cadence_minutes) || 15] : []),
      ].filter((value) => value > 0);
      const cadenceMinutes = cadenceValues.length > 0 ? Math.min(...cadenceValues) : 60;
      if (await companyHasRecentRequest(supabase, companySlug, cadenceMinutes)) {
        results.push({ company_slug: companySlug, status: "skipped", reason: "recent request exists" });
        continue;
      }

      const { data: requestData, error: requestError } = await supabase.rpc(
        "create_operations_collection_request",
        {
          p_company_slug: companySlug,
          p_request_type: "OPERATIONS_PULSE",
          p_requested_reports: requestReports,
          p_priority: manifestAssignment?.effective_priority ?? 80,
          p_request_payload: buildRequestPayload(activeRows, manifestAssignment),
        }
      );

      if (requestError) {
        results.push({ company_slug: company.company_slug, status: "error", error: requestError.message });
        continue;
      }

      if (manifestAssignment) {
        const { error: assignmentUpdateError } = await supabase
          .schema("core")
          .from("company_operations_ticket_assignment")
          .update({ last_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", manifestAssignment.id);

        if (assignmentUpdateError) throw new Error(assignmentUpdateError.message);
      }

      results.push({
        company_slug: company.company_slug,
        status: "created",
        request_id: requestData?.id,
        manifest_first: Boolean(manifestAssignment),
        ticket_library_assignment_id: manifestAssignment?.id ?? null,
      });
    } catch (error) {
      results.push({ company_slug: company.company_slug, status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({
    ok: true,
    generated: results,
    elapsed_ms: Date.now() - startedAt,
  });
}
