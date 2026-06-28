import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const weekEnd = req.nextUrl.searchParams.get("weekEnd");
  const supabase = await getSupabaseServerClient();

  if (!weekEnd) {
    return NextResponse.json({ error: "weekEnd is required.", adjustments: [] }, { status: 400 });
  }

  const weekStart = addDays(weekEnd, -6);

  const { data: adjustments, error } = await supabase
    .from("company_payroll_adjustment_event_v")
    .select("*")
    .eq("company_slug", slug)
    .eq("is_active", true)
    .lte("start_date", weekEnd)
    .gte("end_date", weekStart)
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, adjustments: [] }, { status: 500 });
  }

  return NextResponse.json({ adjustments: adjustments ?? [] }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = await getSupabaseServerClient();

    const rosterMemberIds = Array.isArray(body.roster_member_ids)
      ? body.roster_member_ids.filter((id: unknown) => typeof id === "string" && id.trim())
      : [];

    const { data, error } = await supabase.rpc("create_company_payroll_adjustment", {
      p_company_slug: slug,
      p_adjustment_key: text(body.adjustment_key) || "HOLIDAY_PAY",
      p_adjustment_label: text(body.adjustment_label) || "Holiday Pay",
      p_adjustment_scope: text(body.adjustment_scope) || "GLOBAL",
      p_start_date: text(body.start_date),
      p_end_date: text(body.end_date),
      p_amount: Number(body.amount ?? 0),
      p_amount_mode: text(body.amount_mode) || "DAILY",
      p_notes: text(body.notes),
      p_roster_member_ids: rosterMemberIds,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to create adjustment.", detail: error.message, code: error.code ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, result: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create adjustment.", detail: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
