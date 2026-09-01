import { NextRequest, NextResponse } from "next/server";
import {
  resolveAutomationAccess,
  resolveCompanyBySlug,
} from "@/features/automation/server/automation.repository";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const OVERRIDE_MODES = new Set(["OPERATING", "CLOSED", "INHERIT"]);

function normalizeDate(value: unknown) {
  const date = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.allowed) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.status }
      );
    }

    const operationalDate = normalizeDate(
      req.nextUrl.searchParams.get("date")
    );
    if (!operationalDate) {
      return NextResponse.json(
        { error: "A valid date query parameter is required." },
        { status: 400 }
      );
    }

    const resolved = await resolveCompanyBySlug(supabase, slug);
    if (!resolved.company) {
      return NextResponse.json(
        { error: resolved.error ?? "Company not found." },
        { status: 404 }
      );
    }

    const { data: assignment, error } = await createSupabaseServiceRoleClient()
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
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload =
      assignment?.assignment_payload_json &&
      typeof assignment.assignment_payload_json === "object"
        ? assignment.assignment_payload_json
        : {};

    return NextResponse.json({
      operational_date: operationalDate,
      can_manage: access.canAdmin,
      operating_calendar: assignment
        ? {
            assignment_id: assignment.id,
            start_time: assignment.start_time,
            end_time: assignment.end_time,
            operating_weekdays: payload.operating_weekdays ?? [],
            operating_date_overrides:
              payload.operating_date_overrides ?? {},
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load the operating calendar.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.canAdmin) {
      return NextResponse.json(
        { error: access.error ?? "Administrator access is required." },
        { status: access.allowed ? 403 : access.status }
      );
    }

    const body = await req.json().catch(() => ({}));
    const operationalDate = normalizeDate(body.operational_date);
    const overrideMode = String(body.override_mode ?? "").trim().toUpperCase();

    if (!operationalDate) {
      return NextResponse.json(
        { error: "A valid operational_date is required." },
        { status: 400 }
      );
    }
    if (!OVERRIDE_MODES.has(overrideMode)) {
      return NextResponse.json(
        { error: "override_mode must be OPERATING, CLOSED, or INHERIT." },
        { status: 400 }
      );
    }

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc(
      "set_company_operations_date_override",
      {
        p_company_slug: slug,
        p_operational_date: operationalDate,
        p_override_mode: overrideMode,
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      override: data,
      scheduler_sync: "PENDING",
      message: "The assigned runner will refresh this calendar on its next private poll.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update the operating calendar.",
      },
      { status: 500 }
    );
  }
}
