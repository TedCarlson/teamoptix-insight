// app/api/region/[region]/techs/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_TABLE = "ingest_batches_v1";
const PINS_TABLE = "ingest_batch_pins_v1";
const RAW_TABLE = "ingest_raw_rows_v1";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function s(v: any) {
  return String(v ?? "").trim();
}

function num(v: any): number {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function isIsoDate(s0: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s0);
}

type TechRow = { tech_id: string; tech_name: string | null; supervisor: string | null };

async function fetchRowsForRegion(sb: any, batch_id: string, region_name: string) {
  // Probe likely region column names without guessing schema
  const probes: Array<{ col: string }> = [{ col: "region_name" }, { col: "region" }];

  for (const p of probes) {
    const { data, error } = await sb.from(RAW_TABLE).select("*").eq("batch_id", batch_id).eq(p.col, region_name);
    if (!error) return { data: data ?? [], usedCol: p.col };
  }

  // If both probes errored, return the last error in a consistent shape
  const { error } = await sb.from(RAW_TABLE).select("*").eq("batch_id", batch_id).eq("region_name", region_name);
  return { data: [], usedCol: null as string | null, error };
}

/**
 * GET /api/region/[region]/techs
 * Optional:
 *  - ?fiscal_month_anchor=YYYY-MM-DD
 *  - ?mode=reportable
 */
export async function GET(req: Request, { params }: { params: { region: string } }) {
  try {
    const regionParam = s(params?.region);
    const region_name = regionParam ? decodeURIComponent(regionParam) : "";

    if (!region_name) {
      return NextResponse.json({ ok: false, error: "Missing region param" }, { status: 400 });
    }

    const url = new URL(req.url);
    const mode = s(url.searchParams.get("mode")); // optional: "reportable"
    const fiscal_month_anchor = s(url.searchParams.get("fiscal_month_anchor")); // optional YYYY-MM-DD

    if (fiscal_month_anchor && !isIsoDate(fiscal_month_anchor)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fiscal_month_anchor (expected YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();

    // 1) Latest committed ontrac batch (optionally scoped to fiscal_month_anchor)
    let q = sb
      .from(BATCH_TABLE)
      .select("batch_id,upload_set_id,source_system,fiscal_month_anchor,status,created_at")
      .eq("source_system", "ontrac")
      .eq("status", "committed");

    if (fiscal_month_anchor) q = q.eq("fiscal_month_anchor", fiscal_month_anchor);

    const { data: latest_batch, error: batchErr } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (batchErr) return NextResponse.json({ ok: false, error: batchErr.message }, { status: 500 });

    if (!latest_batch?.batch_id) {
      return NextResponse.json(
        {
          ok: false,
          error: fiscal_month_anchor
            ? `No committed ontrac batch found for fiscal_month_anchor=${fiscal_month_anchor}`
            : "No committed ontrac batch found",
        },
        { status: 404 }
      );
    }

    const batch_id = String(latest_batch.batch_id);

    // 2) Pin for that batch (if present)
const { data: pin, error: pinErr } = await sb
  .from(PINS_TABLE)
  .select(
  "batch_id,fiscal_month_anchor,scope,source_system,rubric_version_id,settings_pinned_at,pinned_at"
)
  .eq("batch_id", batch_id)
  .limit(1)
  .maybeSingle();

if (pinErr) {
  return NextResponse.json({ ok: false, error: pinErr.message }, { status: 500 });
}


    // 3) Pull raw rows for that batch + region (probe region column)
    const rowsResult = await fetchRowsForRegion(sb, batch_id, region_name);

    if ((rowsResult as any).error) {
      return NextResponse.json(
        { ok: false, error: (rowsResult as any).error?.message ?? "Failed to fetch raw rows" },
        { status: 500 }
      );
    }

    const rows = (rowsResult as any).data ?? [];
    const usedRegionColumn = (rowsResult as any).usedCol ?? null;

    const eligible = rows.filter((r: any) => {
      if (mode !== "reportable") return true;

      // Prefer typed column if it exists, else attempt payload field
      const direct = (r as any).total_ftr_contact_jobs;
      if (direct != null) return num(direct) > 0;

      const payload = (r as any).payload;
      if (payload && typeof payload === "object") {
        const fromPayload =
          payload.total_ftr_contact_jobs ??
          payload["Total FTR/Contact Jobs"] ??
          payload["total_ftr_contact_jobs"];
        return num(fromPayload) > 0;
      }

      return false;
    });

    // 4) Group by tech
    const byTech = new Map<string, TechRow>();

    for (const r of eligible) {
      // Try both flattened columns and payload extraction without assuming one
      const payload = (r as any).payload && typeof (r as any).payload === "object" ? (r as any).payload : null;

      const tech_id = s((r as any).tech_id) || s(payload?.tech_id) || s(payload?.TechId) || s((r as any).TechId);
      if (!tech_id) continue;

      const tech_name =
        s((r as any).tech_name) || s(payload?.tech_name) || s(payload?.TechName) || s((r as any).TechName) || null;

      const supervisor =
        s((r as any).supervisor) ||
        s(payload?.supervisor) ||
        s(payload?.Supervisor) ||
        s((r as any).Supervisor) ||
        null;

      const prev = byTech.get(tech_id) ?? { tech_id, tech_name: null, supervisor: null };

      if (!prev.tech_name && tech_name) prev.tech_name = tech_name;
      if (!prev.supervisor && supervisor) prev.supervisor = supervisor;

      byTech.set(tech_id, prev);
    }

    const techs: TechRow[] = Array.from(byTech.values()).sort((a, b) => a.tech_id.localeCompare(b.tech_id));

    return NextResponse.json({
      ok: true,
      region_name,
      requested_fiscal_month_anchor: fiscal_month_anchor || null,
      latest_batch,
      pin: pin ?? null,
      techs,
      counts: {
        raw_rows_in_region: rows.length,
        eligible_rows_in_region: eligible.length,
        techs: techs.length,
      },
      debug: {
        region_column_used: usedRegionColumn,
      },
      rule: {
        reportable_requires_total_ftr_contact_jobs_gt_0: true,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
