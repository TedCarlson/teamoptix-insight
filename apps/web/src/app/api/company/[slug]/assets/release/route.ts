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
    const reason =
      typeof body.release_reason === "string" && body.release_reason.trim()
        ? body.release_reason.trim()
        : "RELEASED";

    if (!assetId) {
      return NextResponse.json({ error: "Missing asset_id." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("release_company_asset", {
      p_company_slug: slug,
      p_asset_id: assetId,
      p_release_reason: reason,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to release asset.", detail: error.message, code: error.code ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, result: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to release asset.", detail: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
