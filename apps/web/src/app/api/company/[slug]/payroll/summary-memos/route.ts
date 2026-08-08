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
  const weekEnd = text(req.nextUrl.searchParams.get("weekEnd"));

  if (!isIsoDate(weekEnd)) {
    return NextResponse.json(
      { error: "A valid weekEnd is required.", memos: [] },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "list_company_payroll_summary_memos",
    {
      p_company_slug: slug,
      p_week_end_date: weekEnd,
    }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message, memos: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ memos: data ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const rosterMemberId = text(body.roster_member_id);
    const weekEnd = text(body.week_end_date);
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";

    if (!rosterMemberId || !isIsoDate(weekEnd)) {
      return NextResponse.json(
        { error: "Roster member and a valid payroll week ending date are required." },
        { status: 400 }
      );
    }

    if (memo.length > 2000) {
      return NextResponse.json(
        { error: "Payroll memo cannot exceed 2000 characters." },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "set_company_payroll_summary_memo",
      {
        p_company_slug: slug,
        p_roster_member_id: rosterMemberId,
        p_week_end_date: weekEnd,
        p_memo: memo,
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, memo: data ?? null });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save payroll memo.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
