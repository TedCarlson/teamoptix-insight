import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Parse numeric values safely
function toNumberMaybe(v: any): number | null {
  if (v === null || v === undefined) return null;

  const raw = String(v).trim();
  if (!raw) return null;

  const isNegative = /^\(.*\)$/.test(raw);
  let s = raw.replace(/^\(|\)$/g, "");
  s = s.replace(/[%,$\s]/g, "");

  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  return isNegative ? -n : n;
}

// Normalize tech_id consistently
function normalizeTechId(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === "nan") return null;
  return s;
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);
    const batch_id: string | null = body?.batch_id ?? null;

    if (!batch_id) {
      return NextResponse.json({ ok: false, error: "Missing batch_id" }, { status: 400 });
    }

    // 1) Load batch
    const { data: batch, error: batchErr } = await sb
      .from("kpi_batches_v1")
      .select("batch_id, source_system, region, fiscal_month_anchor")
      .eq("batch_id", batch_id)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json(
        { ok: false, error: batchErr?.message || "Batch not found" },
        { status: 404 }
      );
    }

    // 2) Load staged rows
    const { data: staged, error: stErr } = await sb
      .from("kpi_raw_rows_v1")
      .select("row_num, region, fiscal_month_anchor, raw")
      .eq("batch_id", batch_id)
      .order("row_num", { ascending: true });

    if (stErr) {
      return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });
    }

    const rows = staged ?? [];
    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "No staged rows found for batch" },
        { status: 400 }
      );
    }

    // 3) Collect normalized tech_ids from raw
    const techIds = Array.from(
      new Set(
        rows
          .map((r: any) => normalizeTechId(
            r.raw?.TechId ?? r.raw?.tech_id ?? r.raw?.TECHID
          ))
          .filter(Boolean)
      )
    );

    if (!techIds.length) {
      return NextResponse.json(
        { ok: false, error: "No valid tech_id values found in batch" },
        { status: 400 }
      );
    }

    // 4) Load ACTIVE roster rows (normalize tech_id here too)
    const { data: rosterRows, error: rErr } = await sb
      .from("roster_v2")
      .select("tech_id, full_name, itg_supervisor, company, status")
      .eq("status", "Active");

    if (rErr) {
      return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
    }

    const rosterMap = new Map<
      string,
      { full_name: string | null; itg_supervisor: string | null; company: string | null }
    >();

    for (const r of rosterRows ?? []) {
      const normId = normalizeTechId(r.tech_id);
      if (!normId) continue;

      rosterMap.set(normId, {
        full_name: r.full_name ?? null,
        itg_supervisor: r.itg_supervisor ?? null,
        company: r.company ?? null,
      });
    }

    // 5) Build KPI master rows
    const out: any[] = [];

    for (const r of rows) {
      const raw = r.raw ?? {};
      const tech_id_norm = normalizeTechId(
        raw.TechId ?? raw.tech_id ?? raw.TECHID
      );

      if (!tech_id_norm) continue;

      const roster = rosterMap.get(tech_id_norm);
      if (!roster) continue; // SKIP if no active roster match

      for (const [key, val] of Object.entries(raw)) {
        if (!key) continue;

        // Skip identity columns completely
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "");

        if (
        normalizedKey.includes("techid") ||
        normalizedKey.includes("technicianid") ||
        normalizedKey.includes("techname") ||
        normalizedKey.includes("supervisor")
        ) {
        continue;
        }


        const metric_name = String(key).trim();
        if (!metric_name) continue;

        out.push({
          batch_id,
          source_system: batch.source_system ?? "Ontrac",
          region: batch.region ?? r.region ?? null,
          fiscal_month_anchor:
            batch.fiscal_month_anchor ?? r.fiscal_month_anchor ?? null,

          tech_id: tech_id_norm,
          tech_name: roster.full_name,
          supervisor: roster.itg_supervisor,
          company: roster.company,

          metric_name,
          metric_value_text: val == null ? null : String(val),
          metric_value_num: toNumberMaybe(val),
        });
      }
    }

    if (!out.length) {
      return NextResponse.json(
        { ok: false, error: "No KPI rows produced after roster filtering" },
        { status: 400 }
      );
    }

    // 5.5) Housekeeping: keep ONLY the latest committed batch for this region+month
{
  const regionKey = (batch.region ?? null) as string | null;
  const anchorKey = (batch.fiscal_month_anchor ?? null) as string | null;

  const { error: delErr } = await sb
    .from("kpi_master_v1")
    .delete()
    .eq("region", regionKey)
    .eq("fiscal_month_anchor", anchorKey)
    .neq("batch_id", batch_id);

  if (delErr) throw new Error(delErr.message);
}


    // 6) Upsert
    const CHUNK = 500;
    let inserted = 0;

    for (let i = 0; i < out.length; i += CHUNK) {
      const chunk = out.slice(i, i + CHUNK);
      const { error } = await sb
        .from("kpi_master_v1")
        .upsert(chunk, {
          onConflict: "batch_id,tech_id,metric_name",
        });

      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }

    // 7) Mark batch committed
    await sb
      .from("kpi_batches_v1")
      .update({ status: "committed", error: null })
      .eq("batch_id", batch_id);

    return NextResponse.json({
      ok: true,
      batch_id,
      inserted,
      active_roster_matches: rosterMap.size,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
