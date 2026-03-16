import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", routes: [] },
        { status: 404 }
      );
    }

    const { data: routes, error } = await sb
      .from("route_baseline")
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
      .eq("company_id", company.id)
      .is("effective_end", null)
      .eq("is_active", true)
      .order("route_name");

    if (error) {
      return NextResponse.json(
        { error: error.message, routes: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      company_id: company.id,
      routes: routes ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load routes.";

    return NextResponse.json(
      { error: message, routes: [] },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = await req.json();

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
      terminal_id,
    } = body ?? {};

    if (!route_name || String(route_name).trim() === "") {
      return NextResponse.json(
        { error: "route_name is required" },
        { status: 400 }
      );
    }

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

    let resolvedTerminalId: string | null = terminal_id ?? null;

    if (!resolvedTerminalId) {
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

      resolvedTerminalId = terminal.terminal_id;
    }

    const { data: inserted, error: insertErr } = await sb
      .from("route_baseline")
      .insert({
        company_id: company.id,
        terminal_id: resolvedTerminalId,
        route_name: String(route_name).trim(),
        current_wa_num: current_wa_num ? String(current_wa_num).trim() : null,
        threshold_stops:
          threshold_stops === "" || threshold_stops == null
            ? null
            : Number(threshold_stops),
        threshold_rate:
          threshold_rate === "" || threshold_rate == null
            ? null
            : Number(threshold_rate),
        route_location: route_location ? String(route_location).trim() : null,
        route_type: route_type ? String(route_type).trim().toUpperCase() : "CORE",
        runs_s: Boolean(runs_s),
        runs_u: Boolean(runs_u),
        runs_m: Boolean(runs_m),
        runs_t: Boolean(runs_t),
        runs_w: Boolean(runs_w),
        runs_h: Boolean(runs_h),
        runs_f: Boolean(runs_f),
        rotation_name: rotation_name ? String(rotation_name).trim() : null,
        is_active: true,
        effective_start: new Date().toISOString().slice(0, 10),
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

    return NextResponse.json(
      { success: true, route: inserted },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create route.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}