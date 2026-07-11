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

function newYorkCurrentMinutes() {
  const date = new Date();
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const [hourText, minuteText] = formatted.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour * 60 + minute;
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

function buildRequestPayload(activeRows: any[]) {
  return {
    source: "automation_scheduler",
    preset: "operations_pulse",
    intent: "operations_pulse",
    request_origin: "automation_scheduler",
    collect_scope: "targeted_file_groups",
    control_level: "platform_managed",
    customer_language: "Operations Pulse",
    runner_goal: "keep_operations_current",
    cadence_minutes: Math.min(...activeRows.map((row) => Number(row.cadence_minutes) || 0)),
    targets: [
      {
        key: "DSW_DAILY_SERVICE",
        label: "DSW · Daily Service Worksheet",
        artifact_key: "DSW",
        report_family_key: "DSW",
        runner_section: "DAILY_SERVICE",
        expected_filename_match: ["daily service worksheet"],
      },
      {
        key: "FCC_SERVICE_AREA_STATUS",
        label: "FCC · Service Area Status",
        artifact_key: "FCC",
        report_family_key: "FCC",
        runner_section: "SERVICE",
        expected_filename_match: ["serviceareastatus", "sastatus", "work area summary"],
      },
    ],
    windows: activeRows.map((row) => ({
      report: row.automation_type,
      window_preset: row.window_preset,
      start_time: row.start_time,
      end_time: row.end_time,
      cadence_minutes: row.cadence_minutes,
    })),
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
  const currentMinutes = newYorkCurrentMinutes();

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
        isWithinWindow(currentMinutes, row?.start_time, row?.end_time)
      );

      if (activeRows.length === 0) {
        results.push({ company_slug: companySlug, status: "skipped", reason: "no active automation window" });
        continue;
      }

      const requestReports = [...new Set(activeRows.map((row: any) => String(row.automation_type).toUpperCase()))].filter(
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

      const cadenceMinutes = Math.min(...activeRows.map((row: any) => Number(row.cadence_minutes) || 0)) || 60;
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
          p_priority: 80,
          p_request_payload: buildRequestPayload(activeRows),
        }
      );

      if (requestError) {
        results.push({ company_slug: company.company_slug, status: "error", error: requestError.message });
        continue;
      }

      results.push({ company_slug: company.company_slug, status: "created", request_id: requestData?.id });
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
