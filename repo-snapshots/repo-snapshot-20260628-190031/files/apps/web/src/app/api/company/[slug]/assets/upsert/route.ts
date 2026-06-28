import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = await getSupabaseServerClient();

    const assetId = text(body.asset_id) || null;
    const providerId = text(body.asset_provider_id) || null;

    const { data, error } = await supabase.rpc("upsert_company_asset_admin", {
      p_company_slug: slug,
      p_asset_id: assetId,
      p_asset_type_key: text(body.asset_type_key),
      p_asset_identifier: text(body.asset_identifier),
      p_asset_status_key: text(body.asset_status_key || "AVAILABLE"),
      p_asset_provider_id: providerId,
      p_secondary_identifier: text(body.secondary_identifier),
      p_notes: text(body.notes),
      p_assignment_muted: Boolean(body.assignment_muted),
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to save asset.", detail: error.message, code: error.code ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save asset.", detail: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
