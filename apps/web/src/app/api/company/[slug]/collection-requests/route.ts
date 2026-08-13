import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveAutomationAccess,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { easternOperationalDayBounds } from "@/lib/operationalDay";

export const runtime = "nodejs";

const ALLOWED_REQUEST_TYPES = new Set([
  "HISTORICAL_BACKFILL",
  "TARGETED_RECOVERY",
]);

const COLLECTION_TRAIL_COLUMNS = [
  "id",
  "company_id",
  "company_slug",
  "request_type",
  "request_status",
  "priority",
  "service_date",
  "service_date_start",
  "service_date_end",
  "requested_reports",
  "request_payload",
  "duration_ms",
  "report_batch_ids",
  "error_message",
  "created_at",
  "updated_at",
  "report_count",
  "manifest_count",
  "route_count",
  "output_receipt_json",
  "lane_priority",
  "registered_count",
  "ready_count",
  "ingesting_count",
  "ingested_count",
  "failed_count",
].join(",");

async function loadAuthoritativeHealthTimes(supabase: any, companyId: string) {
  const [
    { data: latestCollection, error: collectionError },
    { data: latestIngestion, error: ingestionError },
  ] = await Promise.all([
    supabase
      .from("operations_collection_request_v")
      .select("completed_at")
      .eq("company_id", companyId)
      .eq("request_status", "COMPLETE")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("operations_collection_artifact_v")
      .select("ingest_completed_at")
      .eq("company_id", companyId)
      .in("artifact_status", ["INGESTED", "IGNORED"])
      .not("ingest_completed_at", "is", null)
      .order("ingest_completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (collectionError) throw new Error(collectionError.message);
  if (ingestionError) throw new Error(ingestionError.message);

  return {
    latest_collection_success_at: latestCollection?.completed_at ?? null,
    latest_ingestion_success_at:
      latestIngestion?.ingest_completed_at ?? null,
  };
}

function normalizeReports(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim().toUpperCase())
    .filter(Boolean);
}

function parsePriority(value: unknown) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(999, Math.trunc(parsed)));
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function easternDateIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function targetedRecoveryDateError(serviceDate: string) {
  const today = easternDateIso();
  const earliest = new Date(`${today}T12:00:00Z`);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1);
  const earliestIso = earliest.toISOString().slice(0, 10);

  if (serviceDate >= today) return "Targeted recovery requires a prior service date; today and future dates are not allowed.";
  if (serviceDate < earliestIso) return "Targeted recovery is limited to service dates within the last 12 months.";
  return null;
}

async function enrichRowsWithRuntime(supabase: any, rows: any[]) {
  const ids = rows.map((row) => String(row.id ?? "")).filter(Boolean);
  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from("operations_collection_request_runtime_v")
    .select("*")
    .in("collection_request_id", ids);

  if (error) {
    if (error.code === "PGRST205" || error.code === "PGRST204") return rows;
    throw new Error(error.message);
  }

  const runtimeByRequest = new Map(
    (data ?? []).map((runtime: any) => [
      String(runtime.collection_request_id),
      runtime,
    ])
  );
  return rows.map((row) => ({
    ...row,
    runtime: runtimeByRequest.get(String(row.id)) ?? null,
  }));
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyBySlug(supabase, slug);
    if (!resolved.company) {
      return NextResponse.json(
        { error: resolved.error ?? "Company not found.", rows: [] },
        { status: 404 }
      );
    }

    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 1),
      50
    );

    const mode = String(req.nextUrl.searchParams.get("mode") ?? "queue").toLowerCase();
    const activeStatuses = ["QUEUED", "CLAIMED", "RUNNING", "ARTIFACTS_READY", "INGESTING"];

    if (mode === "status") {
      const { operationalDate, start, end } = easternOperationalDayBounds();
      const service = createSupabaseServiceRoleClient();
      const access = await resolveAutomationAccess(supabase, slug);
      const [
        { data, error },
        { data: runnerSchedule, error: scheduleError },
        { data: inDayAssignment, error: assignmentError },
        healthTimes,
      ] = await Promise.all([
        service
          .from("operations_collection_request_v")
          .select(
            "id,company_id,request_type,request_status,error_message,claimed_by,started_at,completed_at,updated_at"
          )
          .eq("company_id", resolved.company.id)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false })
          .limit(Math.min(limit, 10)),
        service
          .from("operations_runner_schedule_v")
          .select(
            "runner_key,collection_enabled,operations_pulse_enabled,operations_pulse_start_time,operations_pulse_end_time,timezone,runner_state,runner_last_seen_at,runner_last_error,runner_metadata_json,report_config_json"
          )
          .eq("company_id", resolved.company.id)
          .maybeSingle(),
        service
          .from("company_operations_ticket_assignment_v")
          .select(
            "id,start_time,end_time,assignment_payload_json"
          )
          .eq("company_id", resolved.company.id)
          .eq("operational_contract", "IN_DAY_OPERATIONS")
          .eq("assignment_status", "active")
          .eq("is_enabled", true)
          .eq("generation_mode", "scheduled")
          .lte("active_start_date", operationalDate)
          .or(`inactive_end_date.is.null,inactive_end_date.gt.${operationalDate}`)
          .order("release_order", { ascending: true })
          .limit(1)
          .maybeSingle(),
        loadAuthoritativeHealthTimes(service, resolved.company.id),
      ]);

      if (error) {
        return NextResponse.json(
          { error: error.message, rows: [] },
          { status: 500 }
        );
      }
      if (scheduleError) {
        return NextResponse.json(
          { error: scheduleError.message, rows: [] },
          { status: 500 }
        );
      }
      if (assignmentError) {
        return NextResponse.json(
          { error: assignmentError.message, rows: [] },
          { status: 500 }
        );
      }
      const assignmentPayload =
        inDayAssignment?.assignment_payload_json &&
        typeof inDayAssignment.assignment_payload_json === "object"
          ? inDayAssignment.assignment_payload_json
          : {};

      return NextResponse.json(
        {
          operational_date: operationalDate,
          company_id: resolved.company.id,
          rows: data ?? [],
          ...healthTimes,
          runner_schedule: runnerSchedule ?? null,
          operating_calendar: inDayAssignment
            ? {
                assignment_id: inDayAssignment.id,
                start_time: inDayAssignment.start_time,
                end_time: inDayAssignment.end_time,
                operating_weekdays:
                  assignmentPayload.operating_weekdays ?? [],
                operating_date_overrides:
                  assignmentPayload.operating_date_overrides ?? {},
              }
            : null,
          can_manage_operating_calendar: access.canAdmin,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    if (mode === "recovery") {
      const today = easternDateIso();
      const earliest = new Date(`${today}T12:00:00Z`);
      earliest.setUTCDate(earliest.getUTCDate() - 5);
      const { data, error } = await supabase
        .from("operations_collection_recovery_candidate_v")
        .select("*")
        .eq("company_id", resolved.company.id)
        .gte("service_date", earliest.toISOString().slice(0, 10))
        .lt("service_date", today)
        .order("failed_at", { ascending: false })
        .limit(limit);

      if (error) {
        // A newly migrated view can briefly be absent from PostgREST's schema
        // cache. Keep the collection center operational while the reload
        // notification propagates; subsequent refreshes will expose the queue.
        if (error.code === "PGRST205") {
          return NextResponse.json({ rows: [], schema_cache_pending: true });
        }
        return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
      }

      return NextResponse.json({ rows: data ?? [] });
    }

    if (mode === "today") {
      const { operationalDate, start, end } = easternOperationalDayBounds();
      const service = createSupabaseServiceRoleClient();
      const [{ data, error }, healthTimes] = await Promise.all([
        supabase
          .from("operations_collection_request_v")
          .select(COLLECTION_TRAIL_COLUMNS)
          .eq("company_id", resolved.company.id)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false })
          .limit(limit),
        loadAuthoritativeHealthTimes(service, resolved.company.id),
      ]);

      if (error) {
        return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
      }
      return NextResponse.json({
        operational_date: operationalDate,
        rows: data ?? [],
        ...healthTimes,
      });
    }

    if (mode === "history") {
      const { data, error } = await supabase
        .from("operations_collection_request_v")
        .select("*")
        .eq("company_id", resolved.company.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
      }

      return NextResponse.json({
        rows: await enrichRowsWithRuntime(supabase, data ?? []),
      });
    }

    const { data: activeRows, error: activeError } = await supabase
      .from("operations_collection_request_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .in("request_status", activeStatuses)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (activeError) {
      return NextResponse.json({ error: activeError.message, rows: [] }, { status: 500 });
    }

    const { data: lastCompleteRows, error: completeError } = await supabase
      .from("operations_collection_request_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .eq("request_status", "COMPLETE")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (completeError) {
      return NextResponse.json({ error: completeError.message, rows: [] }, { status: 500 });
    }

    const rowsById = new Map<string, any>();
    for (const row of activeRows ?? []) rowsById.set(row.id, row);
    for (const row of lastCompleteRows ?? []) rowsById.set(row.id, row);

    const data = Array.from(rowsById.values()).sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );

    return NextResponse.json({
      rows: await enrichRowsWithRuntime(supabase, data),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load collection requests.",
        rows: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.canAdmin) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.allowed ? 403 : access.status }
      );
    }

    const recoveryOfRequestId = String(
      body.recovery_of_request_id ?? body.recoveryOfRequestId ?? ""
    ).trim();

    if (recoveryOfRequestId) {
      const recoveryServiceDate = normalizeDate(
        body.service_date ?? body.serviceDate
      );
      if (!recoveryServiceDate) {
        return NextResponse.json(
          { error: "A recovery service_date is required." },
          { status: 400 }
        );
      }
      const recoveryDateError = targetedRecoveryDateError(recoveryServiceDate);
      if (recoveryDateError) {
        return NextResponse.json({ error: recoveryDateError }, { status: 400 });
      }

      const recoveryArtifactId = String(
        body.artifact_id ?? body.artifactId ?? ""
      ).trim();
      const { data, error } = await createSupabaseServiceRoleClient().rpc(
        "queue_operations_collection_recovery",
        {
          p_collection_request_id: recoveryOfRequestId,
          p_service_date: recoveryServiceDate,
          p_artifact_id: recoveryArtifactId || null,
        }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ row: data }, { status: 201 });
    }

    const requestType = String(body.request_type ?? body.requestType ?? "").trim().toUpperCase();

    if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
      return NextResponse.json(
        {
          error:
            ["PREVIOUS_DAY_CLOSE", "DRO_AM", "OPERATIONS_PULSE", "LAST_LOOK"].includes(requestType)
              ? "Daily collections are controlled by the signed daily-package schedule, not the ticket queue."
              : "Invalid request_type.",
          allowed_request_types: Array.from(ALLOWED_REQUEST_TYPES),
        },
        { status: 400 }
      );
    }

    const serviceDate = normalizeDate(body.service_date ?? body.serviceDate);
    const serviceDateStart = normalizeDate(body.service_date_start ?? body.serviceDateStart);
    const serviceDateEnd = normalizeDate(body.service_date_end ?? body.serviceDateEnd);
    if (requestType === "TARGETED_RECOVERY") {
      if (!serviceDate) {
        return NextResponse.json({ error: "Targeted recovery requires one service_date." }, { status: 400 });
      }
      const recoveryDateError = targetedRecoveryDateError(serviceDate);
      if (recoveryDateError) {
        return NextResponse.json({ error: recoveryDateError }, { status: 400 });
      }
    }
    const requestedReports = normalizeReports(body.requested_reports ?? body.requestedReports);
    const priority = parsePriority(body.priority);
    const requestPayload =
      body.request_payload && typeof body.request_payload === "object" && !Array.isArray(body.request_payload)
        ? body.request_payload
        : body.requestPayload && typeof body.requestPayload === "object" && !Array.isArray(body.requestPayload)
          ? body.requestPayload
          : {};

    const { data, error } = await supabase.rpc("create_operations_collection_request", {
      p_company_slug: slug,
      p_request_type: requestType,
      p_service_date: serviceDate,
      p_service_date_start: serviceDateStart,
      p_service_date_end: serviceDateEnd,
      p_requested_reports: requestedReports,
      p_request_payload: requestPayload,
      p_priority: priority,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create collection request.",
      },
      { status: 500 }
    );
  }
}
