import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const { data, error } = await supabase.rpc("hiring_upsert_candidate", {
      p_company_slug: slug,
      p_full_name: clean(body.full_name),
      p_email: clean(body.email),
      p_phone: clean(body.phone),
      p_worker_type: clean(body.worker_type),
      p_market_code: clean(body.market_code),
      p_note: clean(body.note),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, candidate: data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save candidate.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
