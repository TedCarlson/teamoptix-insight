import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCompanyBySlug } from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

const ALLOWED_REQUEST_TYPES = new Set([
  "PREVIOUS_DAY_CLOSE",
  "LAST_LOOK",
  "HISTORICAL_BACKFILL",
  "TARGETED_RECOVERY",
  "OPERATIONS_PULSE",
]);

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

      return NextResponse.json({ rows: data ?? [] });
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

    return NextResponse.json({ rows: data });
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

    const requestType = String(body.request_type ?? body.requestType ?? "").trim().toUpperCase();

    if (!ALLOWED_REQUEST_TYPES.has(requestType)) {
      return NextResponse.json(
        {
          error: "Invalid request_type.",
          allowed_request_types: Array.from(ALLOWED_REQUEST_TYPES),
        },
        { status: 400 }
      );
    }

    const serviceDate = normalizeDate(body.service_date ?? body.serviceDate);
    const serviceDateStart = normalizeDate(body.service_date_start ?? body.serviceDateStart);
    const serviceDateEnd = normalizeDate(body.service_date_end ?? body.serviceDateEnd);
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
