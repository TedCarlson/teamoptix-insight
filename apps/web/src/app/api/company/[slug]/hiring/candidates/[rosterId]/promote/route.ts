import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadRosterAuthoritativeDto } from "@/features/people/server/loadRosterAuthoritativeDto";

export const runtime = "nodejs";

function positiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> },
) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const targetStatus =
      body?.target_status === "Trainee" || body?.target_status === "Active"
        ? body.target_status
        : null;

    if (!targetStatus) {
      return NextResponse.json(
        { error: "Choose Trainee or Active as the promotion status." },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();
    const { error: promotionError } = await supabase.rpc(
      "promote_company_candidate",
      {
        p_company_slug: slug,
        p_roster_id: rosterId,
        p_target_status: targetStatus,
        p_trainee_daily_pay_rate: positiveNumber(
          body?.trainee_daily_pay_rate,
        ),
        p_baseline_daily_pay_rate: positiveNumber(
          body?.baseline_daily_pay_rate,
        ),
      },
    );

    if (promotionError) {
      return NextResponse.json(
        {
          error: "Candidate promotion could not be completed.",
          detail: promotionError.message,
          code: promotionError.code ?? null,
        },
        { status: 400 },
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Promotion completed, but the company record could not be reloaded." },
        { status: 500 },
      );
    }

    const roster = await loadRosterAuthoritativeDto({
      supabase,
      companySlug: slug,
      companyId: company.id,
      rosterId,
    });

    if (!roster) {
      return NextResponse.json(
        { error: "Promotion completed, but the roster record could not be reloaded." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, roster });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Candidate promotion failed.";

    return NextResponse.json(
      { error: "Candidate promotion failed.", detail },
      { status: 500 },
    );
  }
}
