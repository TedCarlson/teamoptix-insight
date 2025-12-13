import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = {
  region?: string;
  fiscal_month_anchor?: string; // YYYY-MM-DD
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function n(v: any): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(x) ? x : null;
}

function fmtPct(v: number | null, digits = 1) {
  if (v === null) return "—";
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null, digits = 2) {
  if (v === null) return "—";
  return v.toFixed(digits);
}

function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 900, opacity: 0.85, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.3 }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>{subtitle}</div> : null}
    </div>
  );
}

/**
 * Metric mapping.
 * NOTE: tNPS aggregate is computed from components (Promoters/Detractors/Surveys)
 * using ratio-of-summed-components.
 */
type MetricCode =
  | "tnps"
  | "ftr"
  | "tool_usage"
  | "total_jobs"
  | "tnps_promoters"
  | "tnps_detractors"
  | "tnps_surveys";

const METRIC_MAP: Record<MetricCode, string[]> = {
  // per-tech values (used in Rankings table)
  tnps: ["tNPS", "tNPS Rate", "tnps rate", "TNPS", "tnps"],
  ftr: ["FTR", "FTR%", "ftr", "ftr%"],
  tool_usage: ["TUResult", "Tool Usage", "ToolUsage"],
  total_jobs: ["Total Jobs", "TotalJobs"],

  // ✅ tNPS components for correct region aggregates
  tnps_promoters: ["Promoters"],
  tnps_detractors: ["Detractors"],
  tnps_surveys: ["tNPS Surveys", "TNPS Surveys", "tNPS Survey", "TNPS Survey"],
};

function pickMetricCode(metricName: string): MetricCode | null {
  for (const [code, names] of Object.entries(METRIC_MAP) as any) {
    if ((names as string[]).includes(metricName)) return code as MetricCode;
  }
  return null;
}

type PivotRow = {
  tech_id: string;
  tech_name: string | null;
  supervisor: string | null;
  company: string | null;
  region: string | null;
  fiscal_month_anchor: string | null;
  total_jobs: number | null;
  tnps: number | null;
  ftr: number | null;
  tool_usage: number | null;
};

function weightedAvg(rows: PivotRow[], key: keyof PivotRow, weightKey: keyof PivotRow) {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const v = n(r[key] as any);
    const w = n(r[weightKey] as any) ?? 0;
    if (v === null || w <= 0) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

type RegionAgg = {
  region: string;
  fiscal_month_anchor: string | null;
  headcount: number; // distinct tech count (from pivot)
  total_jobs: number;

  // tNPS components
  promoters: number;
  detractors: number;
  surveys: number;

  tnps_region: number | null;
};

function computeTNPSFromComponents(promoters: number, detractors: number, surveys: number): number | null {
  if (!surveys || surveys <= 0) return null;
  const vP = promoters * 100;
  const vD = detractors * -100;
  return (vP + vD) / surveys;
}

export default async function MetricsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const sb = getSupabase();

  // Only fetch metric_name values we care about
  const neededMetricNames = Array.from(new Set(Object.values(METRIC_MAP).flat()));

  let q = sb
    .from("kpi_master_v1")
    .select("tech_id, tech_name, supervisor, company, region, fiscal_month_anchor, metric_name, metric_value_num")
    .in("metric_name", neededMetricNames);

  if (sp.region) q = q.eq("region", sp.region);
  if (sp.fiscal_month_anchor) q = q.eq("fiscal_month_anchor", sp.fiscal_month_anchor);

  const { data, error } = await q;

  if (error) {
    return (
      <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>KPI report view (tNPS / FTR / ToolUsage)</p>

        <div style={{ marginTop: 18, padding: 16, border: "1px solid #f2c2c2", borderRadius: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 6 }}>Could not load KPI report</div>
          <div style={{ opacity: 0.9 }}>{error.message}</div>
          <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
            If this is an RLS error, ensure your UI role can read <code>kpi_master_v1</code>.
          </div>
        </div>
      </main>
    );
  }

  const rows = data ?? [];

  // ----------------------------
  // 1) Pivot tall rows into per-tech rows (Rankings table)
  // ----------------------------
  const techMap = new Map<string, PivotRow>();

  for (const r of rows as any[]) {
    const tech_id = String(r.tech_id ?? "").trim();
    if (!tech_id) continue;

    const code = pickMetricCode(String(r.metric_name ?? ""));
    if (!code) continue;

    const existing =
      techMap.get(tech_id) ??
      ({
        tech_id,
        tech_name: r.tech_name ?? null,
        supervisor: r.supervisor ?? null,
        company: r.company ?? null,
        region: r.region ?? null,
        fiscal_month_anchor: r.fiscal_month_anchor ?? null,
        total_jobs: null,
        tnps: null,
        ftr: null,
        tool_usage: null,
      } as PivotRow);

    existing.tech_name = existing.tech_name ?? r.tech_name ?? null;
    existing.supervisor = existing.supervisor ?? r.supervisor ?? null;
    existing.company = existing.company ?? r.company ?? null;
    existing.region = existing.region ?? r.region ?? null;
    existing.fiscal_month_anchor = existing.fiscal_month_anchor ?? r.fiscal_month_anchor ?? null;

    const v = n(r.metric_value_num);

    // only set if empty to avoid accidental overwrites
    if (code === "total_jobs" && existing.total_jobs === null) existing.total_jobs = v;
    if (code === "tnps" && existing.tnps === null) existing.tnps = v;
    if (code === "ftr" && existing.ftr === null) existing.ftr = v;
    if (code === "tool_usage" && existing.tool_usage === null) existing.tool_usage = v;

    techMap.set(tech_id, existing);
  }

  const pivot = Array.from(techMap.values());

  // sort by job volume desc for MVP
  pivot.sort((a, b) => (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0));

  // ----------------------------
  // 2) Region aggregation (tNPS ratio-of-summed-components)
  // ----------------------------
  const regionMap = new Map<string, RegionAgg>();

  for (const r of rows as any[]) {
    const region = String(r.region ?? "").trim();
    if (!region) continue;

    const metricName = String(r.metric_name ?? "");
    const code = pickMetricCode(metricName);
    if (!code) continue;

    const value = n(r.metric_value_num) ?? 0;

    const agg =
      regionMap.get(region) ??
      ({
        region,
        fiscal_month_anchor: r.fiscal_month_anchor ?? null,
        headcount: 0,
        total_jobs: 0,
        promoters: 0,
        detractors: 0,
        surveys: 0,
        tnps_region: null,
      } as RegionAgg);

    // store a representative month (they should be consistent when filtered)
    agg.fiscal_month_anchor = agg.fiscal_month_anchor ?? (r.fiscal_month_anchor ?? null);

    if (code === "total_jobs") agg.total_jobs += value;
    if (code === "tnps_promoters") agg.promoters += value;
    if (code === "tnps_detractors") agg.detractors += value;
    if (code === "tnps_surveys") agg.surveys += value;

    regionMap.set(region, agg);
  }

  // headcount from pivot (distinct techs)
  for (const t of pivot) {
    const region = String(t.region ?? "").trim();
    if (!region) continue;
    const agg = regionMap.get(region);
    if (!agg) continue;
    agg.headcount += 1;
  }

  const regionAggs = Array.from(regionMap.values()).map((a) => ({
    ...a,
    tnps_region: computeTNPSFromComponents(a.promoters, a.detractors, a.surveys),
  }));

  // sort regions by job volume desc
  regionAggs.sort((a, b) => b.total_jobs - a.total_jobs);

  // ----------------------------
  // 3) Top tiles: use correct regional tNPS when possible
  // ----------------------------
  const totalJobsAll = pivot.reduce((acc, r) => acc + (n(r.total_jobs) ?? 0), 0);

  // If a specific region is selected, use that region’s tnps_region
  const selectedRegionAgg = sp.region ? regionAggs.find((x) => x.region === sp.region) : null;
  const tnpsTile =
    selectedRegionAgg?.tnps_region ??
    // If no region filter, compute overall tnps across all regions by summing components
    (() => {
      const promoters = regionAggs.reduce((acc, x) => acc + (x.promoters ?? 0), 0);
      const detractors = regionAggs.reduce((acc, x) => acc + (x.detractors ?? 0), 0);
      const surveys = regionAggs.reduce((acc, x) => acc + (x.surveys ?? 0), 0);
      return computeTNPSFromComponents(promoters, detractors, surveys);
    })() ??
    // Fallback (only if components missing): weighted avg of per-tech tnps
    weightedAvg(pivot, "tnps", "total_jobs");

  // FTR + Tool Usage still using weightedAvg for now (we’ll convert later to ratio-of-components)
  const ftrTile = weightedAvg(pivot, "ftr", "total_jobs");
  const toolTile = weightedAvg(pivot, "tool_usage", "total_jobs");

  const regionLabel = sp.region ?? (pivot[0]?.region ?? "—");
  const fiscalMonthLabel = sp.fiscal_month_anchor ?? (pivot[0]?.fiscal_month_anchor ?? regionAggs[0]?.fiscal_month_anchor ?? "—");

  // Show region grid when user is NOT locked into a region filter
  const showRegionGrid = !sp.region;

  return (
    <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>KPI report view (tNPS / FTR / ToolUsage)</p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Back
          </a>

          <a
            href="/metrics/upload"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Uploads →
          </a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14, opacity: 0.92 }}>
        <div style={{ fontWeight: 900 }}>Region: {String(regionLabel)}</div>
        <div style={{ fontWeight: 900 }}>Headcount: {pivot.length}</div>
        <div style={{ fontWeight: 900 }}>Job Count: {totalJobsAll.toLocaleString()}</div>
        <div style={{ fontWeight: 900 }}>Fiscal Month: {String(fiscalMonthLabel)}</div>
        {sp.region ? (
          <a href="/metrics" style={{ marginLeft: "auto", fontWeight: 900, textDecoration: "none" }}>
            View all regions →
          </a>
        ) : null}
      </div>

      {/* ✅ Top tiles (tNPS uses ratio-of-components) */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Card
          title="tNPS"
          value={fmtNum(tnpsTile, 2)}
          subtitle="Regional: (ΣPromoters*100 + ΣDetractors*-100) / ΣSurveys"
        />
        <Card title="FTR" value={fmtPct(ftrTile, 1)} subtitle="Weighted by Total Jobs (for now)" />
        <Card title="Tool Usage" value={fmtPct(toolTile, 2)} subtitle="Weighted by Total Jobs (for now)" />
      </div>

      {/* ✅ Region grid */}
      {showRegionGrid ? (
        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: 12, fontWeight: 950, borderBottom: "1px solid #ddd" }}>Regions</div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Region</th>
                  <th style={th}>Headcount</th>
                  <th style={th}>Job Count</th>
                  <th style={th}>tNPS</th>
                  <th style={th}>Promoters</th>
                  <th style={th}>Detractors</th>
                  <th style={th}>Surveys</th>
                </tr>
              </thead>
              <tbody>
                {regionAggs.map((rg) => (
                  <tr key={rg.region}>
                    <td style={td}>
                      <a
                        href={`/metrics?region=${encodeURIComponent(rg.region)}${
                          sp.fiscal_month_anchor ? `&fiscal_month_anchor=${encodeURIComponent(sp.fiscal_month_anchor)}` : ""
                        }`}
                        style={{ textDecoration: "none", fontWeight: 900 }}
                      >
                        {rg.region}
                      </a>
                    </td>
                    <td style={tdRight}>{rg.headcount.toLocaleString()}</td>
                    <td style={tdRight}>{rg.total_jobs.toLocaleString()}</td>
                    <td style={tdRight}>{fmtNum(rg.tnps_region, 2)}</td>
                    <td style={tdRight}>{rg.promoters.toLocaleString()}</td>
                    <td style={tdRight}>{rg.detractors.toLocaleString()}</td>
                    <td style={tdRight}>{rg.surveys.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: 12, borderTop: "1px solid #ddd", fontSize: 12, opacity: 0.85 }}>
            tNPS is computed from components (ratio of summed components), matching your Sheets logic.
          </div>
        </div>
      ) : null}

      {/* Rankings */}
      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: 12, fontWeight: 950, borderBottom: "1px solid #ddd" }}>
          Rankings{sp.region ? ` — ${sp.region}` : ""}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Tech ID</th>
                <th style={th}>Company</th>
                <th style={th}>Tech Name</th>
                <th style={th}>ITG Supervisor</th>
                <th style={th}>tNPS</th>
                <th style={th}>FTR%</th>
                <th style={th}>ToolUsage%</th>
                <th style={th}>Total Jobs</th>
              </tr>
            </thead>
            <tbody>
              {pivot.map((r) => (
                <tr key={r.tech_id}>
                  <td style={td}>{r.tech_id}</td>
                  <td style={td}>{r.company ?? "—"}</td>
                  <td style={td}>{r.tech_name ?? "—"}</td>
                  <td style={td}>{r.supervisor ?? "—"}</td>
                  <td style={tdRight}>{fmtNum(r.tnps, 2)}</td>
                  <td style={tdRight}>{fmtPct(r.ftr, 1)}</td>
                  <td style={tdRight}>{fmtPct(r.tool_usage, 2)}</td>
                  <td style={tdRight}>{(n(r.total_jobs) ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #ddd", fontSize: 12, opacity: 0.85 }}>
          If any KPI shows “—”, it means that metric_name is not mapped yet in <code>METRIC_MAP</code>.
        </div>
      </div>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.9,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
