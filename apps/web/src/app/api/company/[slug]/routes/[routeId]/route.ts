import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; routeId: string }> }
) {
  try {
    const { slug, routeId } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = await req.json();

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

    const { data: current, error: currentErr } = await sb
      .from("route_baseline")
      .select("*")
      .eq("id", routeId)
      .eq("company_id", company.id)
      .is("effective_end", null)
      .single();

    if (currentErr || !current) {
      return NextResponse.json(
        { error: "Current route baseline not found" },
        { status: 404 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const {
      route_name,
      current_wa_num,
      threshold_stops,
      threshold_rate,
      route_location,
      route_type,
      runs_s,
      runs_u,
      runs_m,
      runs_t,
      runs_w,
      runs_h,
      runs_f,
      rotation_name,
      is_active,
    } = body ?? {};

    const { error: closeErr } = await sb
      .from("route_baseline")
      .update({
        effective_end: yesterdayStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (closeErr) {
      return NextResponse.json(
        { error: closeErr.message },
        { status: 500 }
      );
    }

    const { data: inserted, error: insertErr } = await sb
      .from("route_baseline")
      .insert({
        company_id: current.company_id,
        terminal_id: current.terminal_id,
        route_name:
          route_name != null ? String(route_name).trim() : current.route_name,
        current_wa_num:
          current_wa_num != null && current_wa_num !== ""
            ? String(current_wa_num).trim()
            : null,
        threshold_stops:
          threshold_stops === "" || threshold_stops == null
            ? null
            : Number(threshold_stops),
        threshold_rate:
          threshold_rate === "" || threshold_rate == null
            ? null
            : Number(threshold_rate),
        route_location:
          route_location != null && route_location !== ""
            ? String(route_location).trim()
            : null,
        route_type:
          route_type != null && route_type !== ""
            ? String(route_type).trim().toUpperCase()
            : current.route_type,
        runs_s: runs_s != null ? Boolean(runs_s) : current.runs_s,
        runs_u: runs_u != null ? Boolean(runs_u) : current.runs_u,
        runs_m: runs_m != null ? Boolean(runs_m) : current.runs_m,
        runs_t: runs_t != null ? Boolean(runs_t) : current.runs_t,
        runs_w: runs_w != null ? Boolean(runs_w) : current.runs_w,
        runs_h: runs_h != null ? Boolean(runs_h) : current.runs_h,
        runs_f: runs_f != null ? Boolean(runs_f) : current.runs_f,
        rotation_name:
          rotation_name != null && rotation_name !== ""
            ? String(rotation_name).trim()
            : null,
        is_active: is_active != null ? Boolean(is_active) : current.is_active,
        effective_start: today,
        effective_end: null,
      })
      .select(`
        id,
        route_name,
        current_wa_num,
        route_location,
        route_type,
        threshold_stops,
        threshold_rate,
        runs_s,
        runs_u,
        runs_m,
        runs_t,
        runs_w,
        runs_h,
        runs_f,
        rotation_name,
        is_active,
        effective_start
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
      route: inserted,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update route.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}