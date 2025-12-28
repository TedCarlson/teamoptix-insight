// app/api/reports/tech-scorecard/route.ts
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
function isIsoDate(x: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(x);
}

/**
 * GET /api/reports/tech-scorecard
 *   ?scope=global
 *   &source_system=ontrac
 *   &fiscal_month_anchor=YYYY-MM-DD
 *   &region=Keystone
 *   [&tech_id=12345]
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = s(url.searchParams.get("scope"));
    const source_system = s(url.searchParams.get("source_system")) || "ontrac";
    const fiscal_month_anchor = s(url.searchParams.get("fiscal_month_anchor"));
    const region = s(url.searchParams.get("region"));
    const tech_id = s(url.searchParams.get("tech_id"));

    if (!scope) return NextResponse.json({ ok: false, error: "Missing scope" }, { status: 400 });
    if (!fiscal_month_anchor || !isIsoDate(fiscal_month_anchor)) {
      return NextResponse.json(
        { ok: false, error: "Missing/invalid fiscal_month_anchor (expected YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();

    // 1) Spine rows
    let q = sb
      .from("tech_scorecard_base_v1")
      .select(
        "scope,source_system,fiscal_month_anchor,batch_id,pinned_at,region,tech_id,first_seen_at,last_seen_at,raw_row_count,prior_fiscal_month_anchor,prior_raw_row_count,mom_raw_row_delta"
      )
      .eq("scope", scope)
      .eq("source_system", source_system)
      .eq("fiscal_month_anchor", fiscal_month_anchor);

    if (region) q = q.eq("region", region);
    if (tech_id) q = q.eq("tech_id", tech_id);

    const { data: spine, error: spineErr } = await q;
    if (spineErr) return NextResponse.json({ ok: false, error: spineErr.message }, { status: 500 });

    const rows = spine ?? [];
    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        scope,
        source_system,
        fiscal_month_anchor,
        region: region || null,
        tech_id: tech_id || null,
        rows: [],
        counts: { rows: 0 },
      });
    }

    // 2) Enrich display fields
    const batchIds = Array.from(new Set(rows.map((r: any) => String(r.batch_id))));

    let eQ = sb
      .from("ingest_ontrac_region_techs_reportable_v1")
      .select("batch_id,region,tech_id,tech_name,supervisor,total_ftr_contact_jobs,is_reportable")
      .in("batch_id", batchIds);

    if (region) eQ = eQ.eq("region", region);
    if (tech_id) eQ = eQ.eq("tech_id", tech_id);

    const { data: enrich, error: enrichErr } = await eQ;
    if (enrichErr) return NextResponse.json({ ok: false, error: enrichErr.message }, { status: 500 });

    const idx = new Map<string, any>();
    for (const e of enrich ?? []) {
      const k = `${e.batch_id}::${e.region}::${e.tech_id}`;
      if (!idx.has(k)) idx.set(k, e);
    }

    const out = rows.map((r: any) => {
      const k = `${r.batch_id}::${r.region}::${r.tech_id}`;
      const e = idx.get(k) ?? null;
      return {
        ...r,
        tech_name: e?.tech_name ?? null,
        supervisor: e?.supervisor ?? null,
        is_reportable: e?.is_reportable ?? null,
        total_ftr_contact_jobs: e?.total_ftr_contact_jobs ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      fiscal_month_anchor,
      region: region || null,
      tech_id: tech_id || null,
      rows: out,
      counts: { rows: out.length },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
