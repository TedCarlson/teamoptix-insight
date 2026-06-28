import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function dateOrToday(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return new Date().toISOString().slice(0, 10);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const rate = Number(body.trainee_daily_pay_rate);

    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json({ error: "Valid trainee pay rate is required." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase.rpc("set_roster_trainee_pay_override", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_trainee_daily_pay_rate: rate,
      p_effective_start: dateOrToday(body.effective_start),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, trainee_pay_override: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save trainee pay.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
