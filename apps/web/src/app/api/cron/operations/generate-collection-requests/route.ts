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
    source: "collection_center",
    intent: "workday_refresh",
    request_origin: "automation_scheduler",
    cadence_minutes: Math.min(...activeRows.map((row) => Number(row.cadence_minutes) || 0)),
    windows: activeRows.map((row) => ({
      report: row.automation_type,
      window_preset: row.window_preset,
      start_time: row.start_time,
      end_time: row.end_time,
      cadence_minutes: row.cadence_minutes,
    })),
  };
}

async function companyHasActiveRequest(supabase: any, companyId: string) {
  const { data, error } = await supabase
    .from("public.operations_collection_request_v")
    .select("id")
    .eq("company_id", companyId)
    .in("request_status", ACTIVE_REQUEST_STATUSES)
    .limit(1);

  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

async function companyHasRecentRequest(supabase: any, companySlug: string, cadenceMinutes: number) {
  const { data, error } = await supabase
    .from("public.operations_collection_request_v")
    .select("created_at")
    .eq("company_slug", companySlug)
    .eq("request_type", "OPERATIONS_FEED")
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
    .from("core.companies")
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
          p_request_type: "OPERATIONS_FEED",
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
