import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveAutomationAccess,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

const ACTIVE_PLAN_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "PROCESSING",
];

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function normalizeText(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function parsePriority(value: unknown) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(999, Math.trunc(parsed)));
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

    let query = supabase
      .from("operations_manifest_capture_plan_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (mode !== "history") {
      query = query.in("plan_status", ACTIVE_PLAN_STATUSES);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load manifest capture plans.",
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

    const serviceDate = normalizeDate(body.service_date ?? body.serviceDate);
    const routeKey = normalizeText(body.route_key ?? body.routeKey);
    const routeLabel = normalizeText(body.route_label ?? body.routeLabel) ?? routeKey;

    if (!serviceDate) {
      return NextResponse.json(
        { error: "service_date is required as YYYY-MM-DD." },
        { status: 400 }
      );
    }

    if (!routeKey) {
      return NextResponse.json({ error: "route_key is required." }, { status: 400 });
    }

    const priority = parsePriority(body.priority);
    const batchLabel =
      normalizeText(body.batch_label ?? body.batchLabel) ?? "manifest-one-route";
    const createdReason =
      normalizeText(body.created_reason ?? body.createdReason) ??
      "Manual debug one-route manifest capture plan.";
    const metadata = normalizeMetadata(body.metadata_json ?? body.metadataJson);

    const { data, error } = await createSupabaseServiceRoleClient().rpc(
      "create_operations_manifest_capture_plan",
      {
        p_company_slug: slug,
        p_service_date: serviceDate,
        p_routes: [
          {
            route_key: routeKey,
            route_label: routeLabel,
            selection_reason: "debug_one_route",
            delivery_manifest_requested: true,
            pickup_manifest_requested: true,
            combined_manifest_requested: false,
            metadata_json: {
              source: "manifest_capture_plan_debug_endpoint",
            },
          },
        ],
        p_collection_mode: "route_selective",
        p_manifest_types: ["delivery", "pickup"],
        p_skip_combined: true,
        p_priority: priority,
        p_batch_label: batchLabel,
        p_created_reason: createdReason,
        p_metadata_json: {
          source: "manifest_capture_plan_debug_endpoint",
          ...metadata,
        },
      }
    );

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
            : "Failed to create manifest capture plan.",
      },
      { status: 500 }
    );
  }
}
