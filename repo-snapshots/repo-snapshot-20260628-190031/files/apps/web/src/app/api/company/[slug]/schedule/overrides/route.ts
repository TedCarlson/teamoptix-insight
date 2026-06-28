import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type OverridePayload = {
  roster_member_id?: string | null;
  override_type?: "CALL_OUT" | "TIME_OFF" | "ADD_IN" | null;
  start_date?: string | null;
  end_date?: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", rows: [] },
        { status: 404 }
      );
    }

    const { data: overrides, error: overrideErr } = await sb
      .from("schedule_override")
      .select(
        "id, company_id, roster_member_id, override_type, start_date, end_date, is_active, created_at"
      )
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (overrideErr) {
      return NextResponse.json(
        { error: overrideErr.message, rows: [] },
        { status: 500 }
      );
    }

    const rosterIds = Array.from(
      new Set((overrides ?? []).map((row) => row.roster_member_id).filter(Boolean))
    );

    let rosterMap = new Map<string, { full_name: string | null; worker_type: string | null }>();

    if (rosterIds.length > 0) {
      const { data: rosterRows } = await sb
        .from("company_roster_view")
        .select("roster_member_id, full_name, worker_type")
        .eq("company_id", company.id)
        .in("roster_member_id", rosterIds);

      rosterMap = new Map(
        (rosterRows ?? []).map((row) => [
          String(row.roster_member_id),
          {
            full_name: row.full_name ?? null,
            worker_type: row.worker_type ?? null,
          },
        ])
      );
    }

    const rows = (overrides ?? []).map((row) => {
      const roster = rosterMap.get(String(row.roster_member_id));

      return {
        ...row,
        full_name: roster?.full_name ?? null,
        worker_type: roster?.worker_type ?? null,
      };
    });

    return NextResponse.json({ rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load overrides.";

    return NextResponse.json(
      { error: message, rows: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = (await req.json()) as OverridePayload;

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const rosterMemberId = cleanText(body.roster_member_id);
    const overrideType = cleanText(body.override_type);
    const startDate = cleanText(body.start_date);
    const endDate = cleanText(body.end_date);

    if (!rosterMemberId || !overrideType || !startDate || !endDate) {
      return NextResponse.json(
        { error: "roster_member_id, override_type, start_date, and end_date are required." },
        { status: 400 }
      );
    }

    if (!["CALL_OUT", "TIME_OFF", "ADD_IN"].includes(overrideType)) {
      return NextResponse.json(
        { error: "Unsupported override_type." },
        { status: 400 }
      );
    }

    const { error: insertErr } = await sb.from("schedule_override").insert({
      company_id: company.id,
      terminal_id: "00000000-0000-0000-0000-000000000000",
      roster_member_id: rosterMemberId,
      override_type: overrideType,
      start_date: startDate,
      end_date: endDate,
      route_name_override: null,
      is_active: true,
    });

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message, step: "insert_override" },
        { status: 500 }
      );
    }

    const { data: commitData, error: commitErr } = await sb.rpc(
      "paint_schedule_day_fact_for_company",
      {
        p_company_id: company.id,
        p_start_date: startDate,
        p_horizon_days: 70,
      }
    );

    if (commitErr) {
      return NextResponse.json(
        {
          error: commitErr.message,
          step: "paint_schedule_day_fact_for_company",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      commit: commitData ?? {},
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create override.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}