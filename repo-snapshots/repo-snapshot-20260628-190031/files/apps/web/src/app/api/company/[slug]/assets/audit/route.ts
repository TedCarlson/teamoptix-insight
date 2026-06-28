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
    .or("status_key.neq.AVAILABLE,assigned_person_id.not.is.null")
    .order("asset_type_key", { ascending: true })
    .order("asset_identifier", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load asset audit queue." },
      { status: 500 }
    );
  }

  return NextResponse.json({ assets: data ?? [] });
}
