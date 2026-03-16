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
        effective_start,
        effective_end
      `)
      .eq("company_id", company.id)
      .order("route_name")
      .order("effective_start", { ascending: false });

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
      error instanceof Error ? error.message : "Failed to load route history.";

    return NextResponse.json(
      { error: message, routes: [] },
      { status: 500 }
    );
  }
}