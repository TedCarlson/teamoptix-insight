import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();
    const serviceDate = req.nextUrl.searchParams.get("date");

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", rows: [] },
        { status: 404 }
      );
    }

    let query = sb
      .from("schedule_day_fact_view")
      .select("*")
      .eq("company_id", company.id);

    if (serviceDate) {
      query = query.eq("service_date", serviceDate);
    }

    const { data, error } = await query
      .order("service_date", { ascending: true })
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      company_id: company.id,
      rows: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load generated schedule.";

    return NextResponse.json(
      { error: message, rows: [] },
      { status: 500 }
    );
  }
}