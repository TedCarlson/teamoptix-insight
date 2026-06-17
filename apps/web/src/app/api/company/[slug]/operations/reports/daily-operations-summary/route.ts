import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function todayNyIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const url = new URL(req.url);
  const serviceDate = text(url.searchParams.get("date")) || addDaysIso(todayNyIso(), -1);

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("get_daily_operations_summary", {
    p_company_id: company.id,
    p_service_date: serviceDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    company_name: company.company_name,
    service_date: serviceDate,
    summary: data?.[0] ?? null,
  });
}
