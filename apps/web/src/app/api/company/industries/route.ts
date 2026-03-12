import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("company_industries")
    .select("id, industry_label")
    .order("industry_label");

  if (error) {
    return NextResponse.json({
      error: error.message,
      industries: [],
    });
  }

  return NextResponse.json({
    industries: data ?? [],
  });
}