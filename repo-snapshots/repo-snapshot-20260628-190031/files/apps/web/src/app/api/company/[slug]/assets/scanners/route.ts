import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("company_assets_v")
    .select("*")
    .eq("company_slug", slug)
    .eq("asset_type_key", "SCANNER")
    .order("asset_identifier", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load scanner assets." },
      { status: 500 }
    );
  }

  return NextResponse.json({ assets: data ?? [] });
}
