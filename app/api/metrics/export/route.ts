import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Escape double quotes by doubling them, wrap if contains comma/quote/newline
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

async function getLatestMonth(sb: ReturnType<typeof getSupabase>, viewName: string) {
  const { data, error } = await sb
    .from(viewName)
    .select("fiscal_month_anchor")
    .not("fiscal_month_anchor", "is", null)
    .order("fiscal_month_anchor", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const month = data?.[0]?.fiscal_month_anchor ? String(data[0].fiscal_month_anchor) : "";
  return month;
}

export async function GET(req: Request) {
  try {
    const sb = getSupabase();
    const url = new URL(req.url);

    // Fixed to your Meta view for MVP
    const viewName = "kpi_meta_rankings_v2";

    const level = (url.searchParams.get("level") || "").trim();
    const rankScope = (url.searchParams.get("rank_scope") || "").trim();
    const monthParam = (url.searchParams.get("month") || "").trim();

    const month = monthParam || (await getLatestMonth(sb, viewName));
    if (!month) {
      return new Response("No fiscal_month_anchor found to export.", { status: 400 });
    }

    let q = sb.from(viewName).select("*").eq("fiscal_month_anchor", month);

    if (level) q = q.eq("level", level);
    if (rankScope) q = q.eq("rank_scope", rankScope);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const csv = toCSV(rows);

    const safeLevel = level ? level : "all-levels";
    const safeScope = rankScope ? rankScope : "all-scopes";
    const filename = `metrics-${month}-${safeLevel}-${safeScope}.csv`;

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
