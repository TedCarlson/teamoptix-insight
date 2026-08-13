import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CompanyAssetRow } from "@/features/company/assets/asset.types";
import { loadAssetsWithAssignedRosterPins } from "@/features/company/assets/server/assignedRosterPins";

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
    .eq("asset_type_key", "FUEL_CARD")
    .order("asset_identifier", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load fuel card assets." },
      { status: 500 }
    );
  }

  try {
    const assets = await loadAssetsWithAssignedRosterPins(
      supabase,
      (data ?? []) as CompanyAssetRow[],
    );
    return NextResponse.json({ assets });
  } catch (pinError) {
    return NextResponse.json(
      {
        error:
          pinError instanceof Error
            ? pinError.message
            : "Failed to load driver PINs.",
      },
      { status: 500 },
    );
  }
}
