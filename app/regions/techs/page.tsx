// app/regions/techs/page.tsx
"use client";

import React from "react";

type MonthCtxRow = {
  scope: string;
  source_system: string;
  fiscal_month_anchor: string;
  is_latest_for_scope_source: boolean;
  pinned_at: string | null;
  batch_id: string | null;
  upload_set_id: string | null;
};

type TechListItem = {
  tech_id: string;
  tech_name: string | null;
  supervisor: string | null;
};

type TechScorecardRow = {
  scope: string;
  source_system: string;
  fiscal_month_anchor: string;
  batch_id: string;
  pinned_at: string | null;

  region: string;
  tech_id: string;

  first_seen_at: string | null;
  last_seen_at: string | null;

  raw_row_count: number | null;

  prior_fiscal_month_anchor: string | null;
  prior_raw_row_count: number | null;
  mom_raw_row_delta: number | null;

  tech_name: string | null;
  supervisor: string | null;
  is_reportable: boolean | null;
  total_ftr_contact_jobs: number | null;
};

type MonthResult = {
  fiscal_month_anchor: string;
  batch_id: string | null;
  pinned_at: string | null;
  upload_set_id: string | null;
  row: TechScorecardRow | null;
  error: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  const looksJson =
    contentType.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  if (!looksJson) {
    const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`Non-JSON response: HTTP ${res.status} ${res.statusText} • ${snippet}`);
  }

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`Invalid JSON: HTTP ${res.status} ${res.statusText} • ${snippet}`);
  }

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `HTTP ${res.status} ${res.statusText}`);
  }

  return json as T;
}

function fmtTs(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace("T", " ").replace("Z", "");
}

const box: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
};

const label: React.CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 6 };

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
};

const MONTH_LIMIT = 12; // change later if you want more/less months shown/fetched

export default function RegionsTechsPage() {
  // Hard-lock scope per your decision
  const scope = "global";
  const source_system = "ontrac";

  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // context
  const [ctxRows, setCtxRows] = React.useState<MonthCtxRow[]>([]);
  const [regions, setRegions] = React.useState<string[]>([]);
  const [ctxLoaded, setCtxLoaded] = React.useState(false);
  const [regionsLoaded, setRegionsLoaded] = React.useState(false);

  // selections
  const [region, setRegion] = React.useState<string>("");
  const [techs, setTechs] = React.useState<TechListItem[]>([]);
  const [techId, setTechId] = React.useState<string>("");

  // results (one entry per month)
  const [series, setSeries] = React.useState<MonthResult[]>([]);

  // Load month context (pin-driven)
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErr(null);
        setBusy("Loading context…");

        const ctx = await fetchJson<{
          ok: true;
          source_system: string;
          scopes: string[];
          months: MonthCtxRow[];
        }>(`/api/ref/tech-scorecard-context?source_system=${encodeURIComponent(source_system)}`);

        if (cancelled) return;

        setCtxRows(Array.isArray(ctx.months) ? ctx.months : []);
        setCtxLoaded(true);

        setBusy(null);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load month context");
        setCtxLoaded(false);
        setBusy(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load regions (required)
  React.useEffect(() => {
    let cancelled = false;

    async function loadRegions() {
      try {
        const r = await fetchJson<{ ok: true; regions: string[] }>(`/api/ref/regions`);
        if (cancelled) return;
        setRegions(Array.isArray(r.regions) ? r.regions : []);
        setRegionsLoaded(true);
      } catch {
        if (cancelled) return;
        setRegions([]);
        setRegionsLoaded(false);
      }
    }

    loadRegions();
    return () => {
      cancelled = true;
    };
  }, []);

  // Canonical months list (deduped by fiscal_month_anchor, latest-first), limited for layout/perf
  const months = React.useMemo(() => {
    const list = ctxRows
      .filter((m) => m.scope === scope && m.source_system === source_system)
      .sort((a, b) => {
        // month desc
        if (a.fiscal_month_anchor !== b.fiscal_month_anchor) {
          return a.fiscal_month_anchor < b.fiscal_month_anchor ? 1 : -1;
        }
        // latest pinned row first
        const al = a.is_latest_for_scope_source ? 1 : 0;
        const bl = b.is_latest_for_scope_source ? 1 : 0;
        if (al !== bl) return bl - al;

        // pinned_at desc
        const ap = a.pinned_at ?? "";
        const bp = b.pinned_at ?? "";
        if (ap !== bp) return ap < bp ? 1 : -1;

        // stable tie-break
        const ab = a.batch_id ?? "";
        const bb = b.batch_id ?? "";
        return ab < bb ? 1 : ab > bb ? -1 : 0;
      });

    const byMonth = new Map<string, MonthCtxRow>();
    for (const m of list) {
      if (!byMonth.has(m.fiscal_month_anchor)) byMonth.set(m.fiscal_month_anchor, m);
    }

    return Array.from(byMonth.values()).slice(0, MONTH_LIMIT);
  }, [ctxRows]);

  const latestPinnedMonth = React.useMemo(() => {
    if (!months.length) return null;
    return months.find((m) => m.is_latest_for_scope_source) ?? months[0];
  }, [months]);

  // Load tech list when region is selected.
  // Uses the latest pinned month as the anchor for tech list query (authoritative: pinned current view).
  React.useEffect(() => {
    let cancelled = false;

    async function loadTechs() {
      setTechs([]);
      setTechId("");
      setSeries([]);
      setErr(null);

      if (!region) return;
      if (!latestPinnedMonth?.fiscal_month_anchor) return;

      try {
        setBusy("Loading techs…");

       const resp = await fetchJson<{ ok: true; techs: TechListItem[] }>(
  `/api/region/techs?region=${encodeURIComponent(region)}&fiscal_month_anchor=${encodeURIComponent(
    latestPinnedMonth.fiscal_month_anchor
  )}`
);


        if (cancelled) return;

        const list = Array.isArray(resp.techs) ? resp.techs : [];
        list.sort((a, b) => String(a.tech_id).localeCompare(String(b.tech_id)));

        setTechs(list);
        setBusy(null);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load techs");
        setBusy(null);
      }
    }

    loadTechs();
    return () => {
      cancelled = true;
    };
  }, [region, latestPinnedMonth?.fiscal_month_anchor]);

  const selectedTech = React.useMemo(() => {
    return techs.find((t) => t.tech_id === techId) ?? null;
  }, [techs, techId]);

  const canRun = React.useMemo(() => {
    return !busy && ctxLoaded && regionsLoaded && !!region && !!techId && months.length > 0;
  }, [busy, ctxLoaded, regionsLoaded, region, techId, months.length]);

  async function run() {
    if (!canRun) return;

    setErr(null);
    setBusy("Loading report…");
    setSeries([]);

    try {
      // Fetch each month for this tech (server-side tech_id filter is supported per your GO)
      const tasks = months.map(async (m): Promise<MonthResult> => {
        const qs = new URLSearchParams();
        qs.set("scope", scope);
        qs.set("source_system", source_system);
        qs.set("fiscal_month_anchor", m.fiscal_month_anchor);
        qs.set("region", region);
        qs.set("tech_id", techId);

        try {
          const resp = await fetchJson<{
            ok: true;
            rows: TechScorecardRow[];
          }>(`/api/reports/tech-scorecard?${qs.toString()}`);

          const row = Array.isArray(resp.rows) && resp.rows.length ? resp.rows[0] : null;

          return {
            fiscal_month_anchor: m.fiscal_month_anchor,
            batch_id: m.batch_id ?? null,
            pinned_at: m.pinned_at ?? null,
            upload_set_id: m.upload_set_id ?? null,
            row,
            error: null,
          };
        } catch (e: any) {
          return {
            fiscal_month_anchor: m.fiscal_month_anchor,
            batch_id: m.batch_id ?? null,
            pinned_at: m.pinned_at ?? null,
            upload_set_id: m.upload_set_id ?? null,
            row: null,
            error: e?.message ?? "Fetch failed",
          };
        }
      });

      const results = await Promise.all(tasks);

      // Keep same month order as dropdown list (latest-first)
      setSeries(results);
      setBusy(null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load report");
      setBusy(null);
    }
  }

  const disabledReason = React.useMemo(() => {
    if (busy) return "Busy.";
    if (!ctxLoaded) return "Loading month context…";
    if (!regionsLoaded) return "Loading regions…";
    if (!months.length) return "No months available.";
    if (!region) return "Select region.";
    if (!techId) return "Select tech.";
    return null;
  }, [busy, ctxLoaded, regionsLoaded, months.length, region, techId]);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Tech Report</h1>
      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Tech drilldown shows a multi-month series for a selected tech. Months shown: latest{" "}
        <b>{MONTH_LIMIT}</b> pinned fiscal anchors (latest-first).
      </p>

      <section style={{ ...box, marginTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Controls</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div>
            <div style={label}>Region (required)</div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={input}
              disabled={!regionsLoaded || !!busy}
            >
              <option value="" disabled>
                {regionsLoaded ? "Select region…" : "Loading…"}
              </option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              Region scopes tech search to avoid cross-region tech_id collisions.
            </div>
          </div>

          <div>
            <div style={label}>Tech (required)</div>
            <select
              value={techId}
              onChange={(e) => setTechId(e.target.value)}
              style={input}
              disabled={!region || !!busy}
            >
              <option value="" disabled>
                {!region ? "Select region first…" : techs.length ? "Select tech…" : "Loading…"}
              </option>
              {techs.map((t) => (
                <option key={t.tech_id} value={t.tech_id}>
                  {t.tech_id}
                  {t.tech_name ? ` — ${t.tech_name}` : ""}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              {selectedTech ? (
                <>
                  <b>Name:</b> {selectedTech.tech_name ?? "—"} • <b>Supervisor:</b>{" "}
                  {selectedTech.supervisor ?? "—"}
                </>
              ) : (
                <>—</>
              )}
            </div>
          </div>

          <div>
            <div style={label}>Month context</div>
            <div style={{ ...input, background: "rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
                <div>
                  <b>Scope:</b> {scope} • <b>Source:</b> {source_system}
                </div>
                <div>
                  <b>Months loaded:</b> {months.length}
                </div>
                <div>
                  <b>Latest pinned month:</b>{" "}
                  {latestPinnedMonth ? (
                    <>
                      {latestPinnedMonth.fiscal_month_anchor} • <b>batch:</b>{" "}
                      {latestPinnedMonth.batch_id ?? "—"} • <b>upload_set_id:</b>{" "}
                      {latestPinnedMonth.upload_set_id ?? "—"} • <b>pinned_at:</b>{" "}
                      {fmtTs(latestPinnedMonth.pinned_at)}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            title={disabledReason ?? "Run"}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.18)",
              background: canRun ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.03)",
              cursor: canRun ? "pointer" : "not-allowed",
              fontWeight: 900,
            }}
          >
            {busy ? busy : "Run →"}
          </button>

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Fetch: {months.length} month{months.length === 1 ? "" : "s"} for tech <b>{techId || "—"}</b>
          </div>
        </div>

        {err ? (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(220,60,60,0.6)" }}>
            <div style={{ fontWeight: 900 }}>Error</div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>{err}</div>
          </div>
        ) : null}
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Tech series</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {series.length ? `${series.length} month${series.length === 1 ? "" : "s"}` : "No output loaded"}
          </div>
        </div>

        {series.length ? (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {[
                    "Fiscal Month",
                    "Pinned At",
                    "Batch ID",
                    "upload_set_id",
                    "Reportable",
                    "FTR/Contact Jobs",
                    "Raw Rows",
                    "Prior Month",
                    "Prior Rows",
                    "MoM Δ",
                    "Error",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 8px",
                        borderBottom: "1px solid rgba(0,0,0,0.12)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((m) => {
                  const r = m.row;
                  return (
                    <tr key={m.fiscal_month_anchor}>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {m.fiscal_month_anchor}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {fmtTs(m.pinned_at)}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                        {m.batch_id ?? "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                        {m.upload_set_id ?? "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {r?.is_reportable == null ? "—" : r.is_reportable ? "✅" : "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {r?.total_ftr_contact_jobs == null ? "—" : String(r.total_ftr_contact_jobs)}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {r?.raw_row_count ?? "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {r?.prior_fiscal_month_anchor ?? "—"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {r?.prior_raw_row_count == null ? "—" : String(r.prior_raw_row_count)}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {r?.mom_raw_row_delta == null ? "—" : String(r.mom_raw_row_delta)}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                        {m.error ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 10, opacity: 0.75 }}>
            Select Region → Tech, then Run to fetch a multi-month series.
          </div>
        )}
      </section>
    </main>
  );
}
