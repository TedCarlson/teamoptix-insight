// app/api/ref/tech-scorecard-context/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * GET /api/ref/tech-scorecard-context?source_system=ontrac
 * Returns available scopes + fiscal_month_anchors based on fiscal_month_context_v1,
 * enriched with upload_set_id from ingest_batches_v1 via batch_id.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const source_system = s(url.searchParams.get("source_system")) || "ontrac";

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("fiscal_month_context_v1")
      .select(
        "scope,source_system,fiscal_month_anchor,is_latest_for_scope_source,pinned_at,batch_id"
      )
      .eq("source_system", source_system)
      .order("fiscal_month_anchor", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = data ?? [];

    // Enrich upload_set_id via batch_id -> ingest_batches_v1
    const batchIds = Array.from(
      new Set(rows.map((r: any) => String(r.batch_id ?? "")).filter((x) => x.length > 0))
    );

    const uploadSetByBatch = new Map<string, string | null>();

    if (batchIds.length) {
      const { data: batches, error: bErr } = await sb
        .from("ingest_batches_v1")
        .select("batch_id,upload_set_id")
        .in("batch_id", batchIds);

      if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });

      for (const b of batches ?? []) {
        uploadSetByBatch.set(String((b as any).batch_id), (b as any).upload_set_id ?? null);
      }
    }

    const scopes = Array.from(new Set(rows.map((r: any) => String(r.scope)))).sort();

    const months = rows.map((r: any) => ({
      scope: r.scope,
      source_system: r.source_system,
      fiscal_month_anchor: r.fiscal_month_anchor,
      is_latest_for_scope_source: r.is_latest_for_scope_source,
      pinned_at: r.pinned_at,
      batch_id: r.batch_id,
      upload_set_id: uploadSetByBatch.get(String(r.batch_id ?? "")) ?? null,
    }));

    return NextResponse.json({ ok: true, source_system, scopes, months });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
