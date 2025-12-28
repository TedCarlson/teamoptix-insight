// app/api/rubric/version/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const scope = (searchParams.get("scope") || "global").trim();
    const source_system = (searchParams.get("source_system") || "ontrac").trim().toLowerCase();

    const todayISO = new Date().toISOString().slice(0, 10);
    const anchorParam = searchParams.get("anchor");

    const sb = sbAdmin();

    // If caller provides an anchor, honor it.
    // Otherwise: resolve "latest committed rubric version as-of today" (<= today).
    let fiscal_month_anchor: string | null = anchorParam ? anchorParam.slice(0, 10) : null;

    if (!fiscal_month_anchor) {
      const { data: latestList, error: latestErr } = await sb
        .from("ingest_rubric_versions_v1")
        .select("fiscal_month_anchor, committed_at")
        .eq("scope", scope)
        .eq("source_system", source_system)
        .eq("active", true)
        .lte("fiscal_month_anchor", todayISO)
        .order("fiscal_month_anchor", { ascending: false })
        .order("committed_at", { ascending: false })
        .limit(1);

      if (latestErr) throw latestErr;

      const latest = (latestList ?? [])[0] ?? null;

      if (!latest?.fiscal_month_anchor) {
        return NextResponse.json({
          ok: true,
          scope,
          source_system,
          fiscal_month_anchor: null,
          version: null,
          thresholds: [],
        });
      }

      fiscal_month_anchor = String(latest.fiscal_month_anchor).slice(0, 10);
    }

    // Load all versions for that anchor, pick active if present, else newest
    const { data: versions, error: vErr } = await sb
      .from("ingest_rubric_versions_v1")
      .select("id, scope, source_system, fiscal_month_anchor, committed_at, committed_by, notes, active")
      .eq("scope", scope)
      .eq("source_system", source_system)
      .eq("fiscal_month_anchor", fiscal_month_anchor)
      .order("id", { ascending: false });

    if (vErr) throw vErr;

    const list = versions ?? [];
    const active = list.find((v: any) => v.active) ?? list[0] ?? null;

    if (!active) {
      return NextResponse.json({
        ok: true,
        scope,
        source_system,
        fiscal_month_anchor,
        version: null,
        thresholds: [],
      });
    }

    const { data: thresholds, error: tErr } = await sb
      .from("ingest_rubric_thresholds_v1")
      .select(
        "metric_name, band, min_value, max_value, inclusive_min, inclusive_max, color_token, report_label_snapshot, format_snapshot"
      )
      .eq("rubric_version_id", active.id);

    if (tErr) throw tErr;

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      fiscal_month_anchor,
      version: active,
      thresholds: thresholds ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}
