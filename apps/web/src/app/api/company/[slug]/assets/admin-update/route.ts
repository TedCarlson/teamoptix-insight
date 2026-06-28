import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = await getSupabaseServerClient();

    const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : "";
    if (!assetId) {
      return NextResponse.json({ error: "Missing asset_id." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("update_company_asset_admin", {
      p_company_slug: slug,
      p_asset_id: assetId,
      p_notes: typeof body.notes === "string" ? body.notes : "",
      p_assignment_muted: Boolean(body.assignment_muted),
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to update asset.", detail: error.message, code: error.code ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, result: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update asset.", detail: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
