import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ScheduleBaselinePayload = {
  preset_id?: string | null;
  rotation_mode?: string | null;
  anchor_date?: string | null;
  default_route_s?: string | null;
  default_route_u?: string | null;
  default_route_m?: string | null;
  default_route_t?: string | null;
  default_route_w?: string | null;
  default_route_h?: string | null;
  default_route_f?: string | null;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; rosterMemberId: string }> }
) {
  try {
    const { slug, rosterMemberId } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = (await req.json()) as ScheduleBaselinePayload;

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    if (!body?.preset_id) {
      return NextResponse.json(
        { error: "preset_id is required" },
        { status: 400 }
      );
    }

    const { data: terminal, error: terminalErr } = await sb
      .from("company_terminal")
      .select("terminal_id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (terminalErr) {
      return NextResponse.json(
        { error: terminalErr.message },
        { status: 500 }
      );
    }

    if (!terminal?.terminal_id) {
      return NextResponse.json(
        { error: "No active terminal found for company" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const { data: currentRows, error: currentErr } = await sb
      .from("schedule_baseline")
      .select("id")
      .eq("company_id", company.id)
      .eq("roster_member_id", rosterMemberId)
      .is("effective_end", null)
      .eq("is_active", true);

    if (currentErr) {
      return NextResponse.json(
        { error: currentErr.message },
        { status: 500 }
      );
    }

    const currentIds = (currentRows ?? []).map((row) => row.id).filter(Boolean);

    if (currentIds.length > 0) {
      const { error: closeErr } = await sb
        .from("schedule_baseline")
        .update({
          effective_end: yesterdayStr,
          updated_at: new Date().toISOString(),
        })
        .in("id", currentIds);

      if (closeErr) {
        return NextResponse.json(
          { error: closeErr.message },
          { status: 500 }
        );
      }
    }

    const insertRow = {
      company_id: company.id,
      terminal_id: terminal.terminal_id,
      roster_member_id: rosterMemberId,
      preset_id: body.preset_id,
      rotation_mode: body.rotation_mode?.trim() || "NONE",
      anchor_date: body.anchor_date || today,
      default_route_s: body.default_route_s?.trim() || null,
      default_route_u: body.default_route_u?.trim() || null,
      default_route_m: body.default_route_m?.trim() || null,
      default_route_t: body.default_route_t?.trim() || null,
      default_route_w: body.default_route_w?.trim() || null,
      default_route_h: body.default_route_h?.trim() || null,
      default_route_f: body.default_route_f?.trim() || null,
      effective_start: today,
      effective_end: null,
      is_active: true,
    };

    const { data: inserted, error: insertErr } = await sb
      .from("schedule_baseline")
      .insert(insertRow)
      .select(`
        id,
        roster_member_id,
        preset_id,
        rotation_mode,
        anchor_date,
        default_route_s,
        default_route_u,
        default_route_m,
        default_route_t,
        default_route_w,
        default_route_h,
        default_route_f,
        effective_start,
        effective_end,
        is_active
      `)
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      baseline: inserted,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save schedule baseline.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}