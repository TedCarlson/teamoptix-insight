import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("company_asset_status_v")
    .select("*")
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message, statuses: [] }, { status: 500 });
  }

  return NextResponse.json({ statuses: data ?? [] });
}
