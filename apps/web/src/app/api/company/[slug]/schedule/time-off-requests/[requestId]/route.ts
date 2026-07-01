import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; requestId: string }>;
};

type AccessContext = {
  auth_user_id?: string | null;
};

type ReviewPayload = {
  decision?: "APPROVED" | "DENIED";
  manager_note?: string | null;
};

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, requestId } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = (await req.json()) as ReviewPayload;

    if (body.decision !== "APPROVED" && body.decision !== "DENIED") {
      return NextResponse.json(
        { error: "decision must be APPROVED or DENIED." },
        { status: 400 }
      );
    }

    const { data: access } = await sb.rpc("access_context");
    const typedAccess = access as AccessContext | null;

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: requestRow, error: requestErr } = await sb
      .from("driver_time_off_request")
      .select("id, company_id, roster_member_id, start_date, end_date, status")
      .eq("company_id", company.id)
      .eq("id", requestId)
      .maybeSingle();

    if (requestErr || !requestRow) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (requestRow.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending requests can be reviewed." },
        { status: 400 }
      );
    }

    const reviewedAt = new Date().toISOString();
    const managerNote = cleanNote(body.manager_note);

    if (body.decision === "DENIED") {
      const { error: updateErr } = await sb
        .from("driver_time_off_request")
        .update({
          status: "DENIED",
          reviewed_by_auth_user_id: typedAccess?.auth_user_id ?? null,
          reviewed_at: reviewedAt,
          manager_note: managerNote,
          updated_at: reviewedAt,
        })
        .eq("company_id", company.id)
        .eq("id", requestId);

      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message, step: "deny_request" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, decision: "DENIED" });
    }

    const { data: overrideRow, error: overrideErr } = await sb
      .from("schedule_override")
      .insert({
        company_id: company.id,
        terminal_id: "00000000-0000-0000-0000-000000000000",
        roster_member_id: requestRow.roster_member_id,
        override_type: "TIME_OFF",
        start_date: requestRow.start_date,
        end_date: requestRow.end_date,
        route_name_override: null,
        source_request_id: requestRow.id,
        is_active: true,
      })
      .select("id")
      .single();

    if (overrideErr || !overrideRow) {
      return NextResponse.json(
        { error: overrideErr?.message ?? "Failed to create override.", step: "insert_override" },
        { status: 500 }
      );
    }

    const { error: updateErr } = await sb
      .from("driver_time_off_request")
      .update({
        status: "APPROVED",
        reviewed_by_auth_user_id: typedAccess?.auth_user_id ?? null,
        reviewed_at: reviewedAt,
        manager_note: managerNote,
        schedule_override_id: overrideRow.id,
        updated_at: reviewedAt,
      })
      .eq("company_id", company.id)
      .eq("id", requestId);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message, step: "approve_request" },
        { status: 500 }
      );
    }

    const { data: commitData, error: commitErr } = await sb.rpc(
      "paint_schedule_day_fact_for_company",
      {
        p_company_id: company.id,
        p_start_date: requestRow.start_date,
        p_horizon_days: 70,
      }
    );

    if (commitErr) {
      return NextResponse.json(
        { error: commitErr.message, step: "paint_schedule_day_fact_for_company" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      decision: "APPROVED",
      schedule_override_id: overrideRow.id,
      commit: commitData ?? {},
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to review time off request.",
      },
      { status: 500 }
    );
  }
}
