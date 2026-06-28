import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const url = new URL(req.url);

  const startDate = text(url.searchParams.get("startDate"));
  const endDate = text(url.searchParams.get("endDate"));

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found.", days: [] }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("get_daily_operations_calendar", {
    p_company_id: company.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message, days: [] }, { status: 500 });
  }

  return NextResponse.json({ days: data ?? [] });
}
