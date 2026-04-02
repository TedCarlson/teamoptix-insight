import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type CommitPayload = {
  start_date?: string | null;
  horizon_days?: number | null;
};

function cleanDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeHorizonDays(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return 70;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const body = (await req.json().catch(() => ({}))) as CommitPayload;

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", detail: companyErr },
        { status: 404 }
      );
    }

    const startDate = cleanDate(body.start_date);
    const horizonDays = normalizeHorizonDays(body.horizon_days);

    const { data, error } = await sb.rpc("paint_schedule_day_fact_for_company", {
      p_company_id: company.id,
      p_start_date: startDate,
      p_horizon_days: horizonDays,
    });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          detail: error,
          step: "paint_schedule_day_fact_for_company",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      company_id: company.id,
      commit: data ?? {},
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to commit schedule.";

    return NextResponse.json(
      { error: message, step: "unhandled" },
      { status: 500 }
    );
  }
}