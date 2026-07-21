"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Route, X } from "lucide-react";
import type {
  RoutePortfolioPayload,
  RoutePortfolioRoute,
  RoutePortfolioWeek,
  RouteWeekPoint,
} from "./routePortfolio.types";

type SortKey =
  | "route"
  | "stops"
  | "packages"
  | "packagesPerStop"
  | "frequency"
  | "movement";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function number(value: number | null, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: digits,
    signDisplay: value === 0 ? "never" : "exceptZero",
  }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function bandLabel(value: RouteWeekPoint["demandBand"]) {
  if (value === "EXTREME") return "Exceptional";
  if (value === "HEAVY") return "Heavy";
  if (value === "LIGHT") return "Light";
  if (value === "NORMAL_LOW_CONFIDENCE") return "Normal · low confidence";
  if (value === "NORMAL") return "Normal";
  return "Unclassified";
}

function bandStyle(value: RouteWeekPoint["demandBand"]): React.CSSProperties {
  if (value === "EXTREME") return { background: "#fee2e2", color: "#991b1b" };
  if (value === "HEAVY") return { background: "#ede9fe", color: "#6d28d9" };
  if (value === "LIGHT") return { background: "#e0f2fe", color: "#0369a1" };
  return { background: "#eef2f7", color: "#475569" };
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="app-card" style={{ padding: 18 }}>
      <p className="value-card__eyebrow">{label}</p>
      <strong style={{ display: "block", marginTop: 5, fontSize: 28, lineHeight: 1.1 }}>
        {value}
      </strong>
      <p className="app-card__body" style={{ marginTop: 7, fontSize: 12 }}>{detail}</p>
    </article>
  );
}

function TrendChart({ weeks, metric, label }: {
  weeks: Array<RoutePortfolioWeek | RouteWeekPoint>;
  metric: (week: RoutePortfolioWeek | RouteWeekPoint) => number;
  label: string;
}) {
  const width = 920;
  const height = 250;
  const margin = { top: 20, right: 20, bottom: 40, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = weeks.map(metric);
  const maximum = Math.max(...values, 1);
  const x = (index: number) =>
    margin.left + (weeks.length <= 1 ? plotWidth / 2 : (index / (weeks.length - 1)) * plotWidth);
  const y = (value: number) => margin.top + plotHeight - (value / (maximum * 1.12)) * plotHeight;
  const points = weeks.map((week, index) => `${x(index)},${y(metric(week))}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", display: "block" }} role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const value = maximum * fraction;
        return (
          <g key={fraction}>
            <line x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} stroke="#e2e8f0" />
            <text x={margin.left - 10} y={y(value) + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {number(value)}
            </text>
          </g>
        );
      })}
      {weeks.length > 1 ? (
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {weeks.map((week, index) => (
        <g key={week.weekKey}>
          <circle cx={x(index)} cy={y(metric(week))} r="4" fill="#fff" stroke="currentColor" strokeWidth="2" />
          {index % labelEvery === 0 || index === weeks.length - 1 ? (
            <text x={x(index)} y={height - 14} textAnchor="middle" fontSize="10" fill="#64748b">
              {dateLabel(week.weekEnd)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function Movement({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "#94a3b8" }}>—</span>;
  const up = value > 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: up ? "#166534" : value < 0 ? "#b91c1c" : "#64748b", fontWeight: 750 }}>
      {up ? <ArrowUpRight size={14} /> : value < 0 ? <ArrowDownRight size={14} /> : null}
      {percent(value)}
    </span>
  );
}

function RouteDrawer({ route, onClose }: { route: RoutePortfolioRoute; onClose: () => void }) {
  const [metric, setMetric] = useState<"stops" | "packages" | "pps">("stops");
  const latest = route.latestWeek;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,.35)", display: "flex", justifyContent: "flex-end" }} onMouseDown={onClose}>
      <aside style={{ width: "min(760px, 96vw)", height: "100%", overflowY: "auto", background: "#fff", boxShadow: "-18px 0 50px rgba(15,23,42,.16)" }} onMouseDown={(event) => event.stopPropagation()}>
        <header style={{ padding: 24, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 20 }}>
          <div>
            <p className="value-card__eyebrow">Route history</p>
            <h2 style={{ margin: "5px 0 0", fontSize: 28 }}>Route {route.routeName}</h2>
            <p className="app-card__body" style={{ marginTop: 6 }}>
              {route.operatedDays} operating days across {route.observedWeeks} observed weeks · {route.confidence.toLowerCase()} confidence
            </p>
          </div>
          <button className="app-button app-button--secondary" onClick={onClose} aria-label="Close route history"><X size={17} /></button>
        </header>

        <div style={{ padding: 24, display: "grid", gap: 18 }}>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <MetricCard label="Stops / day" value={number(route.averageStopsPerDay, 1)} detail="Observed route average" />
            <MetricCard label="Packages / day" value={number(route.averagePackagesPerDay, 1)} detail="Observed route average" />
            <MetricCard label="Packages / stop" value={number(route.averagePackagesPerStop, 2)} detail="Handling intensity" />
            <MetricCard label="Operating frequency" value={percent(route.frequency)} detail="Share of company operating days" />
          </section>

          <article className="app-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <p className="value-card__eyebrow">Weekly trend</p>
                <h3 className="app-card__title" style={{ fontSize: 18 }}>Route operating history</h3>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {([ ["stops", "Stops"], ["packages", "Packages"], ["pps", "Packages / stop"] ] as const).map(([key, text]) => (
                  <button key={key} className={`app-button ${metric === key ? "app-button--primary" : "app-button--secondary"}`} onClick={() => setMetric(key)} style={{ minHeight: 34, padding: "6px 10px" }}>{text}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10, color: "#2563eb" }}>
              <TrendChart
                weeks={route.weeks}
                label={`${route.routeName} ${metric} trend`}
                metric={(week) => metric === "stops" ? week.stops : metric === "packages" ? week.packages : week.packagesPerStop ?? 0}
              />
            </div>
          </article>

          <article className="app-card" style={{ padding: 18 }}>
            <p className="value-card__eyebrow">Current position</p>
            <h3 className="app-card__title" style={{ fontSize: 18, marginTop: 4 }}>Latest operating week</h3>
            {latest ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 14 }}>
                <div><span className="app-card__body">Stops</span><strong style={{ display: "block", fontSize: 20 }}>{number(latest.stops)}</strong><Movement value={latest.stopsWoW} /></div>
                <div><span className="app-card__body">Packages</span><strong style={{ display: "block", fontSize: 20 }}>{number(latest.packages)}</strong><Movement value={latest.packagesWoW} /></div>
                <div><span className="app-card__body">Packages / stop</span><strong style={{ display: "block", fontSize: 20 }}>{number(latest.packagesPerStop, 2)}</strong><Movement value={latest.packagesPerStopWoW} /></div>
                <div><span className="app-card__body">Company stop share</span><strong style={{ display: "block", fontSize: 20 }}>{percent(latest.shareOfCompanyStops, 1)}</strong></div>
              </div>
            ) : null}
          </article>

          <article className="app-card" style={{ padding: 18 }}>
            <p className="value-card__eyebrow">Evidence boundary</p>
            <h3 className="app-card__title" style={{ fontSize: 18, marginTop: 4 }}>Source completeness</h3>
            <p className="app-card__body" style={{ marginTop: 8 }}>
              Route history is based on FINAL DSW route rows only. Duty hours, road hours, mileage density, and geography classifications remain intentionally unavailable until their joins are verified.
            </p>
          </article>
        </div>
      </aside>
    </div>
  );
}

export default function RoutePortfolioSurface({ slug }: { slug: string }) {
  const [initialRange] = useState(() => defaultRange());
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [payload, setPayload] = useState<RoutePortfolioPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("stops");
  const [selectedRoute, setSelectedRoute] = useState<RoutePortfolioRoute | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/company/${slug}/analytics/route-portfolio?startDate=${startDate}&endDate=${endDate}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load route portfolio.");
        return data as RoutePortfolioPayload;
      })
      .then(setPayload)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Failed to load route portfolio.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [slug, startDate, endDate]);

  const sortedRoutes = useMemo(() => {
    const routes = [...(payload?.routes ?? [])];
    return routes.sort((a, b) => {
      if (sortKey === "route") return a.routeName.localeCompare(b.routeName, undefined, { numeric: true });
      if (sortKey === "packages") return (b.latestWeek?.packages ?? 0) - (a.latestWeek?.packages ?? 0);
      if (sortKey === "packagesPerStop") return (b.latestWeek?.packagesPerStop ?? 0) - (a.latestWeek?.packagesPerStop ?? 0);
      if (sortKey === "frequency") return b.frequency - a.frequency;
      if (sortKey === "movement") return (Math.abs(b.latestWeek?.stopsWoW ?? 0)) - (Math.abs(a.latestWeek?.stopsWoW ?? 0));
      return (b.latestWeek?.stops ?? 0) - (a.latestWeek?.stops ?? 0);
    });
  }, [payload, sortKey]);

  const headline = payload?.headline;

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 28 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <p className="value-card__eyebrow">Analytics · Routes</p>
            <h1 style={{ margin: "5px 0 0", fontSize: 34, letterSpacing: "-.035em" }}>Route Intelligence</h1>
            <p className="app-card__body" style={{ marginTop: 8, maxWidth: 760 }}>
              How the company designed its routes, how those routes performed, and where meaningful operating changes are emerging.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700 }}>From<input className="app-input" type="date" value={startDate} onChange={(event) => { setLoading(true); setError(null); setStartDate(event.target.value); }} /></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700 }}>Through<input className="app-input" type="date" value={endDate} onChange={(event) => { setLoading(true); setError(null); setEndDate(event.target.value); }} /></label>
          </div>
        </header>

        {error ? <article className="app-card" style={{ padding: 18, borderColor: "#fecaca" }}><strong>Route portfolio unavailable</strong><p className="app-card__body" style={{ marginTop: 6 }}>{error}</p></article> : null}
        {loading ? <article className="app-card" style={{ padding: 24 }}><p className="app-card__body">Loading FINAL route history…</p></article> : null}

        {!loading && payload ? (
          <div style={{ display: "grid", gap: 18 }}>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <MetricCard label="Routes operated" value={number(headline?.routesOperated ?? 0)} detail="Active in the latest observed week" />
              <MetricCard label="Average stops / route" value={number(headline?.averageStopsPerRoute ?? null, 1)} detail="Across FINAL route instances" />
              <MetricCard label="Average packages / route" value={number(headline?.averagePackagesPerRoute ?? null, 1)} detail="Across FINAL route instances" />
              <MetricCard label="Packages / stop" value={number(headline?.averagePackagesPerStop ?? null, 2)} detail="Company handling profile" />
              <MetricCard label="Heavy routes" value={number(headline?.heavyRoutes ?? 0)} detail="Latest week above normal range" />
              <MetricCard label="Outside normal" value={number(headline?.routesOutsideNormalRange ?? 0)} detail="Light, heavy, or exceptional" />
            </section>

            <article className="app-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <p className="value-card__eyebrow">Company operating context</p>
                  <h2 className="app-card__title" style={{ fontSize: 21, marginTop: 4 }}>Weekly route volume</h2>
                  <p className="app-card__body" style={{ marginTop: 5 }}>Completed delivery stops across all recurring and supplemental route instances.</p>
                </div>
                <span style={{ fontSize: 12, color: "#475569", background: "#f1f5f9", borderRadius: 999, padding: "7px 10px", fontWeight: 750 }}>FINAL DSW · {payload.headline.operatingDays} operating days</span>
              </div>
              <div style={{ marginTop: 10, color: "#2563eb" }}><TrendChart weeks={payload.companyWeeks} metric={(week) => week.stops} label="Company weekly route stop volume" /></div>
            </article>

            <article className="app-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: 18, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <p className="value-card__eyebrow">Route portfolio</p>
                  <h2 className="app-card__title" style={{ fontSize: 21, marginTop: 4 }}>Recurring route position</h2>
                  <p className="app-card__body" style={{ marginTop: 5 }}>Select a route to inspect its own history, company share, and weekly movement.</p>
                </div>
                <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700 }}>Sort by<select className="app-input" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="stops">Latest stops</option><option value="packages">Latest packages</option><option value="packagesPerStop">Packages / stop</option><option value="frequency">Operating frequency</option><option value="movement">Largest WoW movement</option><option value="route">Route identity</option></select></label>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>{["Route", "Latest week", "Stops", "Packages", "Pkg / stop", "WoW stops", "Company share", "Frequency", "Profile", ""].map((label) => <th key={label} style={{ padding: "11px 14px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #e2e8f0" }}>{label}</th>)}</tr></thead>
                  <tbody>
                    {sortedRoutes.map((route) => {
                      const week = route.latestWeek;
                      return (
                        <tr key={route.routeIdentity} onClick={() => setSelectedRoute(route)} style={{ cursor: "pointer" }}>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "#eff6ff", color: "#2563eb" }}><Route size={16} /></span><div><strong>{route.routeName}</strong><small style={{ display: "block", color: "#94a3b8", marginTop: 2 }}>{route.confidence.toLowerCase()} confidence</small></div></div></td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7", whiteSpace: "nowrap" }}>{week ? `${dateLabel(week.weekStart)}–${dateLabel(week.weekEnd)}` : "—"}</td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7", fontWeight: 750 }}>{number(week?.stops ?? null)}</td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7", fontWeight: 750 }}>{number(week?.packages ?? null)}</td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}>{number(week?.packagesPerStop ?? null, 2)}</td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}><Movement value={week?.stopsWoW ?? null} /></td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}>{percent(week?.shareOfCompanyStops ?? null, 1)}</td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}>{percent(route.frequency)}</td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}><span style={{ ...bandStyle(week?.demandBand ?? null), padding: "5px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{bandLabel(week?.demandBand ?? null)}</span></td>
                          <td style={{ padding: "13px 14px", borderBottom: "1px solid #eef2f7" }}><ChevronRight size={16} color="#94a3b8" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sortedRoutes.length === 0 ? <div style={{ padding: 28 }}><strong>No FINAL route history in this range.</strong><p className="app-card__body" style={{ marginTop: 6 }}>Expand the date range after finalized DSW rows are available.</p></div> : null}
            </article>

            <article className="app-card" style={{ padding: 18 }}>
              <p className="value-card__eyebrow">Analytical boundary</p>
              <h2 className="app-card__title" style={{ fontSize: 19, marginTop: 4 }}>Route Portfolio v1</h2>
              <p className="app-card__body" style={{ marginTop: 7 }}>
                This surface compares each route with its own history and the company operating profile using FINAL DSW stops and packages. Time, mileage, geography, leg-stretch, and efficiency claims remain withheld until those evidence lanes are verified.
              </p>
            </article>
          </div>
        ) : null}
      </section>
      {selectedRoute ? <RouteDrawer route={selectedRoute} onClose={() => setSelectedRoute(null)} /> : null}
    </main>
  );
}
