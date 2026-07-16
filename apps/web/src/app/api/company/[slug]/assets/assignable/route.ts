import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["SCANNER", "FUEL_CARD", "PIN"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const assetTypeKey = (
      req.nextUrl.searchParams.get("type") ?? ""
    )
      .trim()
      .toUpperCase();

    if (!ALLOWED_TYPES.has(assetTypeKey)) {
      return NextResponse.json(
        { error: "Unsupported asset type." },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase
      .from("company_assets_v")
      .select(
        "asset_id, company_slug, asset_type_key, asset_type_label, asset_identifier, display_name, status_key, status_label, is_assignable, assignment_muted, assigned_roster_member_id, assigned_roster_member_name, assigned_at",
      )
      .eq("company_slug", slug)
      .eq("asset_type_key", assetTypeKey)
      .order("asset_identifier", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to load assignable assets.",
          detail: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { assets: data ?? [] },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load assignable assets.",
        detail:
          error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 },
    );
  }
}
