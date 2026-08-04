import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; caseId: string }> }
) {
  try {
    const { slug, caseId } = await params;
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "reconcile_resignation_asset_recovery",
      { p_company_slug: slug, p_case_id: caseId }
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to reconcile asset recovery.", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to reconcile asset recovery.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
