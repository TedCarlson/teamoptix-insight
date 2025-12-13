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
 * ✅ EDIT THIS ONLY:
 * These are the metric_name values in kpi_master_v1 that correspond to the 3 KPIs you want.
 *
 * From your earlier list, you definitely have:
 * - "Total Jobs"
 * - "TUResult" (very likely Tool Usage)
 *
 * You did NOT show an explicit "tNPS" or "FTR" metric_name yet, so you must map them
 * to the correct metric_name(s) you actually store.
 */
const METRIC_MAP: Record<"tnps" | "ftr" | "tool_usage" | "total_jobs", string[]> = {
  tnps: [
    // put your actual tnps metric_name(s) here when you confirm them
    "tNPS",
    "tNPS Rate",
    "tnps rate",
    "TNPS",
    "tnps",
  ],
  ftr: [
    // put your actual ftr metric_name(s) here when you confirm them
    "FTR",
    "FTR%",
    "ftr",
    "ftr%",
  ],
  tool_usage: [
    // based on your data
    "TUResult",
    "Tool Usage",
    "ToolUsage",
  ],
  total_jobs: [
    "Total Jobs",
    "TotalJobs",
  ],
};

function pickMetricCode(metricName: string): "tnps" | "ftr" | "tool_usage" | "total_jobs" | null {
  for (const [code, names] of Object.entries(METRIC_MAP) as any) {
    if ((names as string[]).includes(metricName)) return code;
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

export default async function MetricsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const sb = getSupabase();

  // only fetch the metric_name values we care about (keeps it fast)
  const neededMetricNames = Array.from(new Set(Object.values(METRIC_MAP).flat()));

  let q = sb
    .from("kpi_master_v1")
    .select(
      "tech_id, tech_name, supervisor, company, region, fiscal_month_anchor, metric_name, metric_value_num"
    )
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

  // Pivot tall rows into one row per tech_id
  const map = new Map<string, PivotRow>();

  for (const r of rows as any[]) {
    const tech_id = String(r.tech_id ?? "").trim();
    if (!tech_id) continue;

    const key = pickMetricCode(String(r.metric_name ?? ""));
    if (!key) continue;

    const existing =
      map.get(tech_id) ??
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

    // prefer latest non-null identity fields if duplicates come in
    existing.tech_name = existing.tech_name ?? r.tech_name ?? null;
    existing.supervisor = existing.supervisor ?? r.supervisor ?? null;
    existing.company = existing.company ?? r.company ?? null;
    existing.region = existing.region ?? r.region ?? null;
    existing.fiscal_month_anchor = existing.fiscal_month_anchor ?? r.fiscal_month_anchor ?? null;

    const v = n(r.metric_value_num);

    // only set if we don’t already have a value (avoid accidental overwrites)
    if (key === "total_jobs" && existing.total_jobs === null) existing.total_jobs = v;
    if (key === "tnps" && existing.tnps === null) existing.tnps = v;
    if (key === "ftr" && existing.ftr === null) existing.ftr = v;
    if (key === "tool_usage" && existing.tool_usage === null) existing.tool_usage = v;

    map.set(tech_id, existing);
  }

  const pivot = Array.from(map.values());

  const totalJobs = pivot.reduce((acc, r) => acc + (n(r.total_jobs) ?? 0), 0);
  const tnps = weightedAvg(pivot, "tnps", "total_jobs");
  const ftr = weightedAvg(pivot, "ftr", "total_jobs");
  const tool = weightedAvg(pivot, "tool_usage", "total_jobs");

  // sort by total jobs desc for MVP
  pivot.sort((a, b) => (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0));

  const region = sp.region ?? pivot[0]?.region ?? "—";
  const fiscalMonth = sp.fiscal_month_anchor ?? pivot[0]?.fiscal_month_anchor ?? "—";

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
        <div style={{ fontWeight: 900 }}>Region: {String(region)}</div>
        <div style={{ fontWeight: 900 }}>Headcount: {pivot.length}</div>
        <div style={{ fontWeight: 900 }}>Job Count: {totalJobs.toLocaleString()}</div>
        <div style={{ fontWeight: 900 }}>Fiscal Month: {String(fiscalMonth)}</div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Card title="tNPS" value={fmtNum(tnps, 2)} subtitle="Weighted by Total Jobs (if present)" />
        <Card title="FTR" value={fmtPct(ftr, 1)} subtitle="Weighted by Total Jobs (if present)" />
        <Card title="Tool Usage" value={fmtPct(tool, 2)} subtitle="Weighted by Total Jobs (if present)" />
      </div>

      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: 12, fontWeight: 950, borderBottom: "1px solid #ddd" }}>Rankings</div>

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
