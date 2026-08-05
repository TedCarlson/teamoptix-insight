import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const startDate = request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("end");

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return NextResponse.json(
      { error: "A valid contract start and through date are required." },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_workforce_analytics", {
    p_company_slug: slug,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data ?? {});
}
