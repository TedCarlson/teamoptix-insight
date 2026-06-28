import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const assetTypeKey = req.nextUrl.searchParams.get("assetTypeKey") ?? "";
  const supabase = await getSupabaseServerClient();

  let query = supabase
    .from("company_asset_providers_v")
    .select("*")
    .eq("company_slug", slug)
    .eq("is_active", true)
    .order("sort_order")
    .order("provider_label");

  if (assetTypeKey) query = query.eq("asset_type_key", assetTypeKey);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message, providers: [] }, { status: 500 });
  }

  return NextResponse.json({ providers: data ?? [] });
}
