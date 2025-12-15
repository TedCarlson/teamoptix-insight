import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseServer() {
  // Server-side only: use service role
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  const needsWrap = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsWrap ? `"${escaped}"` : escaped;
}

function toCSV(rows: any[]) {
  if (!rows || rows.length === 0) return "";

  // stable header set from first row keys
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(","));

  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape((r as any)[h])).join(","));
  }

  return lines.join("\n");
}

function isValidISODate(s: string) {
  // lightweight YYYY-MM-DD validation (avoids PostgREST date parse errors)
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function getLatestMonth(sb: ReturnType<typeof getSupabaseServer>, source: string) {
  const { data, error } = await sb
    .from(source)
    .select("fiscal_month_anchor")
    .not("fiscal_month_anchor", "is", null)
    .order("fiscal_month_anchor", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0]?.fiscal_month_anchor ? String(data[0].fiscal_month_anchor) : "";
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const url = new URL(req.url);

    // Keep exports aligned with what Metrics page uses
    const source = (url.searchParams.get("source") || "").trim() || "master_kpi_feed_mv";

    const level = (url.searchParams.get("level") || "").trim();
    const rankScope = (url.searchParams.get("rank_scope") || "").trim();

    const divisionId = (url.searchParams.get("division_id") || "").trim();
    const regionId = (url.searchParams.get("region_id") || "").trim();

    const monthParam = (url.searchParams.get("month") || "").trim();
    const month = monthParam || (await getLatestMonth(sb, source));

    if (!month) {
      return new Response(JSON.stringify({ ok: false, error: "No fiscal_month_anchor found to export." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!isValidISODate(month)) {
      return new Response(JSON.stringify({ ok: false, error: `Invalid month format: "${month}"` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let q = sb.from(source).select("*").eq("fiscal_month_anchor", month);

    if (level) q = q.eq("level", level);
    if (rankScope) q = q.eq("rank_scope", rankScope);

    // These columns exist on your RankRow model; safe for master_kpi_feed_mv.
    if (divisionId) q = q.eq("division_id", divisionId);
    if (regionId) q = q.eq("region_id", regionId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const csv = toCSV(rows);

    const safeLevel = level || "all-levels";
    const safeScope = rankScope || "all-scopes";
    const safeDiv = divisionId ? `div-${divisionId}` : "all-divisions";
    const safeReg = regionId ? `reg-${regionId}` : "all-regions";
    const filename = `metrics-${month}-${safeLevel}-${safeScope}-${safeDiv}-${safeReg}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "Export failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
