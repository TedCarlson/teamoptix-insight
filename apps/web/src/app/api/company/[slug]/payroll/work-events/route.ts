import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const startDate = text(req.nextUrl.searchParams.get("startDate"));
  const endDate = text(req.nextUrl.searchParams.get("endDate"));

  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    return NextResponse.json(
      { error: "A valid startDate and endDate are required.", events: [] },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("company_payroll_work_event_v")
    .select("*")
    .eq("company_slug", slug)
    .gte("service_date", startDate)
    .lte("service_date", endDate)
    .order("service_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message, events: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const action = text(body.action) || "create";
    const supabase = await getSupabaseServerClient();

    let serviceDate = text(body.service_date);

    if (action === "reverse") {
      const workEventId = text(body.work_event_id);
      const reason = text(body.reason);

      if (!workEventId || !reason) {
        return NextResponse.json(
          { error: "Work event and reversal reason are required." },
          { status: 400 }
        );
      }

      const { data: existing, error: existingError } = await supabase
        .from("company_payroll_work_event_v")
        .select("service_date")
        .eq("company_slug", slug)
        .eq("work_event_id", workEventId)
        .eq("event_status", "ACTIVE")
        .single();

      if (existingError || !existing) {
        return NextResponse.json(
          { error: "Active payroll work event not found." },
          { status: 404 }
        );
      }

      serviceDate = String(existing.service_date);

      const { error } = await supabase.rpc(
        "reverse_company_payroll_work_event",
        {
          p_company_slug: slug,
          p_work_event_id: workEventId,
          p_reason: reason,
        }
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    } else {
      const rosterMemberId = text(body.roster_member_id);
      const eventType = text(body.event_type);
      const note = text(body.note);
      const payTreatment = text(body.pay_treatment).toUpperCase();
      const overrideDailyPayRate =
        body.override_daily_pay_rate == null
          ? null
          : Number(body.override_daily_pay_rate);

      if (
        !rosterMemberId ||
        !isIsoDate(serviceDate) ||
        !["TRAINING_DAY", "HELPER_DAY", "WALK_ON_DAY"].includes(eventType) ||
        !note
      ) {
        return NextResponse.json(
          {
            error:
              "Person, service date, work type, and supporting note are required.",
          },
          { status: 400 }
        );
      }

      const { error } =
        eventType === "WALK_ON_DAY"
          ? await supabase.rpc("create_company_walk_on_payroll_event", {
              p_company_slug: slug,
              p_roster_member_id: rosterMemberId,
              p_service_date: serviceDate,
              p_pay_treatment: payTreatment,
              p_override_daily_pay_rate: overrideDailyPayRate,
              p_note: note,
            })
          : await supabase.rpc("create_company_payroll_work_event", {
              p_company_slug: slug,
              p_roster_member_id: rosterMemberId,
              p_service_date: serviceDate,
              p_event_type: eventType,
              p_note: note,
            });

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      service_date: serviceDate,
      message:
        action === "reverse"
          ? "Work event reversed and payroll rebuilt."
          : "Work event saved and payroll rebuilt.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update the payroll work event.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
