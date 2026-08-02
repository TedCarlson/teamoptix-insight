import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CompensationBasis } from "@/features/people/lib/compensationModel";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

const BASES: CompensationBasis[] = ["HOURLY", "DAILY", "WEEKLY"];

function numberOrNull(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "get_roster_compensation_model",
      { p_company_slug: slug, p_roster_id: rosterId },
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to load compensation model.", detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ model: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load compensation model.",
        detail: error instanceof Error ? error.message : null,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const basis = String(body.basis ?? "").toUpperCase() as CompensationBasis;
    const rate = numberOrNull(body.rate);
    const hoursPerWeek = numberOrNull(body.hours_per_week);
    const daysPerWeek = numberOrNull(body.days_per_week);

    if (!BASES.includes(basis)) {
      return NextResponse.json(
        { error: "Pay structure must be Hourly, Daily, or Weekly." },
        { status: 400 },
      );
    }

    if (rate == null || rate < 0) {
      return NextResponse.json(
        { error: "A valid non-negative pay rate is required." },
        { status: 400 },
      );
    }

    if (basis === "HOURLY" && (hoursPerWeek == null || hoursPerWeek <= 0)) {
      return NextResponse.json(
        { error: "Hours per week is required for hourly compensation." },
        { status: 400 },
      );
    }

    if (basis === "DAILY" && (daysPerWeek == null || daysPerWeek <= 0)) {
      return NextResponse.json(
        { error: "Days per week is required for daily compensation." },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "set_roster_compensation_model",
      {
        p_company_slug: slug,
        p_roster_id: rosterId,
        p_pay_frequency: basis,
        p_amount: rate,
        p_effective_start_date: body.effective_date || null,
        p_standard_hours_per_week: hoursPerWeek,
        p_standard_days_per_week: daysPerWeek,
      },
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to save compensation model.", detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, model: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save compensation model.",
        detail: error instanceof Error ? error.message : null,
      },
      { status: 500 },
    );
  }
}
