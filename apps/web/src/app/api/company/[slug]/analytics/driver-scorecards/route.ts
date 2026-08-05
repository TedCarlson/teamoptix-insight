import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const date = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const uuid = (value: string | null) =>
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const startDate = date(url.searchParams.get("startDate"));
    const endDate = date(url.searchParams.get("endDate"));
    const asOfDate = date(url.searchParams.get("asOfDate"));
    const rosterId = uuid(url.searchParams.get("rosterId"));

    if (!startDate || !endDate || !asOfDate || startDate > endDate) {
      return NextResponse.json({ error: "A valid contract range is required." }, { status: 400 });
    }

    if (url.searchParams.has("rosterId") && !rosterId) {
      return NextResponse.json({ error: "A valid roster ID is required." }, { status: 400 });
    }

    if (rosterId) {
      const { data, error } = await supabase.rpc("get_company_driver_scorecard_detail", {
        p_company_id: company.id,
        p_roster_id: rosterId,
        p_start_date: startDate,
        p_end_date: asOfDate < endDate ? asOfDate : endDate,
      });
      if (error) return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
      return NextResponse.json({ rows: data ?? [] }, { headers: { "Cache-Control": "private, max-age=900" } });
    }

    const { data, error } = await supabase.rpc("get_company_driver_scorecard_index", {
      p_company_id: company.id,
      p_start_date: startDate,
      p_end_date: endDate,
      p_as_of_date: asOfDate,
    });
    if (error) return NextResponse.json({ error: error.message, drivers: [] }, { status: 500 });
    return NextResponse.json(data ?? { drivers: [] }, { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Driver Scorecards unavailable." }, { status: 500 });
  }
}
