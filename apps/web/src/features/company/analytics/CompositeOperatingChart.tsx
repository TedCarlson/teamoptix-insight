"use client";

import { useMemo, useState } from "react";
import type { CalendarOverlay, OperatingDayPoint, OperatingWeekPoint } from "./operatingIntelligence";
import styles from "./analytics-controls.module.css";

type Grain = "week" | "month";
type Point = { key: string; label: string; start: string; end: string; stops: number; packages: number; routes: number; routeDays: number; operatingDays: number; signal: string | null };
type ComparisonSeries = {
  days: OperatingDayPoint[];
  weeks: OperatingWeekPoint[];
  label: string;
};
const fmt = (value: number, digits = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
const dateLabel = (value: string, grain: Grain) => new Intl.DateTimeFormat(undefined, { month: "short", day: grain === "month" ? undefined : "numeric", year: grain === "month" ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

function volumeCeiling(value: number) {
  const step = value >= 100_000 ? 10_000 : value >= 20_000 ? 5_000 : value >= 5_000 ? 1_000 : value >= 1_000 ? 250 : 100;
  return Math.max(step, Math.ceil(value / step) * step);
}

export function aggregateStopsPerRoute(totalStops: number, totalRouteDays: number) {
  return totalRouteDays > 0 ? totalStops / totalRouteDays : 0;
}

function pointsFor(grain: Grain, days: OperatingDayPoint[], weeks: OperatingWeekPoint[]): Point[] {
  if (grain === "week") return weeks.map((week) => ({ key: week.weekKey, label: dateLabel(week.weekStart, grain), start: week.weekStart, end: week.weekEnd, stops: week.totalStops, packages: week.totalPackages, routes: week.averageRoutes, routeDays: week.routeCount, operatingDays: week.operatingDays, signal: week.supplementalDays ? "SUPPLEMENTAL_OPERATION" : null }));
  const map = new Map<string, Point>();
  for (const day of days) { const key = day.serviceDate.slice(0, 7); const current = map.get(key) ?? { key, label: dateLabel(`${key}-01`, grain), start: `${key}-01`, end: day.serviceDate, stops: 0, packages: 0, routes: 0, routeDays: 0, operatingDays: 0, signal: null }; current.stops += day.totalStops; current.packages += day.totalPackages; current.routeDays += day.routeCount; current.operatingDays += 1; current.routes = current.routeDays / current.operatingDays; current.end = day.serviceDate; current.signal ||= day.signal; map.set(key, current); }
  return [...map.values()];
}

export default function CompositeOperatingChart({ days, weeks, overlays, compact = false, comparison }: { days: OperatingDayPoint[]; weeks: OperatingWeekPoint[]; overlays: CalendarOverlay[]; compact?: boolean; comparison?: ComparisonSeries }) {
  const [grain, setGrain] = useState<Grain>("week");
  const [layers, setLayers] = useState({ stops: true, packages: true, routes: true });
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => pointsFor(grain, days, weeks), [grain, days, weeks]);
  const comparisonPoints = useMemo(
    () =>
      comparison
        ? pointsFor(grain, comparison.days, comparison.weeks)
        : [],
    [comparison, grain]
  );
  const comparisonRatio =
    comparisonPoints.length > 0
      ? Math.min(points.length, comparisonPoints.length) /
        Math.max(points.length, comparisonPoints.length)
      : 0;
  const showComparison = Boolean(comparison && comparisonRatio >= 0.75);
  const width = 1160, height = compact ? 360 : 440, margin = { top: 34, right: 66, bottom: 54, left: 66 };
  const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
  const visibleComparisonPoints = showComparison ? comparisonPoints : [];
  const volumeMax = volumeCeiling(
    Math.max(
      ...points.flatMap((point) => [point.stops, point.packages]),
      ...visibleComparisonPoints.flatMap((point) => [point.stops, point.packages]),
      1
    )
  );
  const routeMax = Math.max(
    ...points.map((point) => point.routes),
    ...visibleComparisonPoints.map((point) => point.routes),
    1
  );
  const step = plotWidth / Math.max(points.length, 1), x = (index: number) => margin.left + step * index + step / 2;
  const yVolume = (value: number) => margin.top + plotHeight - value / volumeMax * plotHeight;
  const area = `${margin.left},${margin.top + plotHeight} ${points.map((point, index) => `${x(index)},${yVolume(point.packages)}`).join(" ")} ${margin.left + plotWidth},${margin.top + plotHeight}`;
  const comparisonPackageLine = visibleComparisonPoints
    .slice(0, points.length)
    .map((point, index) => `${x(index)},${yVolume(point.packages)}`)
    .join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const activePoint = active == null ? null : points[active];
  const activeComparisonPoint =
    showComparison && active !== null
      ? comparisonPoints[active] ?? null
      : null;
  return <article className="app-card" style={{ padding: 0, overflow: "hidden" }}>
    <div className={styles.chartHeader}>
      <div className={styles.chartCopy}>
        <p className="value-card__eyebrow">Demand and deployed capacity</p>
        <h2 className="app-card__title" style={{ fontSize: compact ? 21 : 27 }}>
          Operating relationship
        </h2>
        <p className="app-card__body" style={{ marginTop: 5 }}>
          Stops form the operating load, packages show handling volume, and route bubbles show capacity placed against demand.
        </p>
      </div>
      <div className={styles.chartControls}>
        <div aria-label="Chart interval" className={styles.segmented} role="group">
          {(["week", "month"] as Grain[]).map((item) => (
            <button
              aria-pressed={grain === item}
              className={styles.segmentButton}
              key={item}
              onClick={() => setGrain(item)}
              type="button"
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div aria-label="Visible chart layers" className={styles.layerRail} role="group">
          {(["stops", "packages", "routes"] as const).map((layer) => (
            <button
              aria-pressed={layers[layer]}
              className={styles.layerButton}
              key={layer}
              onClick={() =>
                setLayers((current) => ({
                  ...current,
                  [layer]: !current[layer],
                }))
              }
              type="button"
            >
              <span
                aria-hidden="true"
                className={styles.layerMark}
                data-layer={layer}
              />
              {layer}
            </button>
          ))}
        </div>
        {showComparison ? (
          <div className={styles.seriesLegend} aria-label="Chart series">
            <span><i className={styles.seriesLine} /> Selected</span>
            <span><i className={styles.seriesLine} data-series="comparison" /> {comparison?.label}</span>
          </div>
        ) : null}
      </div>
    </div>
    <div style={{ position: "relative", padding: "0 10px 14px" }}>{activePoint ? <div style={{ position: "absolute", zIndex: 3, top: 10, right: 22, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 10, background: "rgba(255,255,255,.96)", boxShadow: "0 8px 24px rgba(15,23,42,.12)", fontSize: 12 }}><strong>{activePoint.label}</strong><div><b>Selected:</b> {fmt(activePoint.stops)} stops · {fmt(activePoint.packages)} packages</div><div>{fmt(activePoint.routes, 1)} average routes/day · {activePoint.operatingDays} operating days</div>{activeComparisonPoint ? <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid #e2e8f0" }}><b>Comparison:</b> {fmt(activeComparisonPoint.stops)} stops · {fmt(activeComparisonPoint.packages)} packages<div>{fmt(activeComparisonPoint.routes, 1)} average routes/day · {activeComparisonPoint.operatingDays} operating days</div></div> : null}<div>{fmt(activePoint.packages / Math.max(activePoint.stops, 1), 2)} packages/stop · {fmt(aggregateStopsPerRoute(activePoint.stops, activePoint.routeDays), 1)} stops/route</div>{activePoint.signal ? <div style={{ marginTop: 3, color: "#b45309", fontWeight: 800 }}>{activePoint.signal === "SUPPLEMENTAL_OPERATION" ? "Supplemental operation" : "Possible capacity intervention"}</div> : null}</div> : null}<svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", display: "block" }} onMouseLeave={() => setActive(null)} role="img" aria-label={showComparison ? "Selected and comparison-period stops and packages with average routes over time" : "Stops and packages on a shared volume scale with average routes over time"}>
      {overlays.map((overlay) => { const indexes = points.map((point, index) => point.end >= overlay.startDate && point.start <= overlay.endDate ? index : -1).filter((index) => index >= 0); if (!indexes.length) return null; const left = x(indexes[0]) - step/2, right = x(indexes.at(-1)!) + step/2; return <g key={overlay.key}><rect x={left} y={margin.top} width={right-left} height={plotHeight} fill={overlay.kind === "PEAK_RAMP" ? "#f59e0b" : "#7c3aed"} opacity={overlay.kind === "PEAK_RAMP" ? .1 : .07}/><text x={(left+right)/2} y={margin.top+13} textAnchor="middle" fontSize="10" fontWeight="800" fill={overlay.kind === "PEAK_RAMP" ? "#b45309" : "#6d28d9"}>{overlay.kind === "PEAK_RAMP" ? "Demand ramp" : "Peak Season"}</text></g>; })}
      {[0,.25,.5,.75,1].map((fraction) => <g key={fraction}><line x1={margin.left} x2={margin.left+plotWidth} y1={margin.top+plotHeight*(1-fraction)} y2={margin.top+plotHeight*(1-fraction)} stroke="#e2e8f0"/><text x={margin.left-10} y={margin.top+plotHeight*(1-fraction)+4} textAnchor="end" fontSize="10" fill="#64748b">{fmt(volumeMax*fraction)}</text></g>)}
      {layers.packages && points.length > 1 ? <polygon points={area} fill="#60a5fa" opacity=".2" stroke="#2563eb" strokeWidth="2"/> : null}
      {showComparison && layers.packages && comparisonPackageLine ? <polyline points={comparisonPackageLine} fill="none" stroke="#7c3aed" strokeWidth="2.25" strokeDasharray="7 5" opacity=".9" pointerEvents="none"/> : null}
      {showComparison ? visibleComparisonPoints.slice(0, points.length).map((point, index) => <g key={`comparison-${point.key}`} pointerEvents="none">{layers.stops ? <rect x={x(index)-Math.max(1,step*.3)} y={yVolume(point.stops)} width={Math.max(2,step*.6)} height={margin.top+plotHeight-yVolume(point.stops)} rx="3" fill="none" stroke="#7c3aed" strokeWidth="1.5" opacity=".72"/> : null}{layers.routes ? <circle cx={x(index)} cy={margin.top+plotHeight-8} r={4+point.routes/routeMax*10} fill="none" stroke="#7c3aed" strokeWidth="1.5" opacity=".82"/> : null}</g>) : null}
      {points.map((point, index) => <g key={point.key}><rect x={x(index)-step/2} y={margin.top} width={step} height={plotHeight} fill="transparent" onMouseEnter={() => setActive(index)}/>{layers.stops ? <rect x={x(index)-Math.max(1,step*.24)} y={yVolume(point.stops)} width={Math.max(2,step*.48)} height={margin.top+plotHeight-yVolume(point.stops)} rx="2" fill="#334155" opacity=".78" pointerEvents="none"/> : null}{layers.routes ? <><circle cx={x(index)} cy={margin.top+plotHeight-8} r={3+point.routes/routeMax*9} fill="#f59e0b" stroke="#92400e" strokeWidth="1" opacity=".88" pointerEvents="none"/><text x={x(index)} y={margin.top+plotHeight-5} textAnchor="middle" fontSize={point.routes >= 100 ? "7" : "8"} fontWeight="900" fill="#451a03" pointerEvents="none">{fmt(point.routes, point.routes < 10 ? 1 : 0)}</text></> : null}{point.signal ? <path d={`M ${x(index)-5} ${margin.top+4} L ${x(index)+5} ${margin.top+4} L ${x(index)} ${margin.top+14} Z`} fill={point.signal === "SUPPLEMENTAL_OPERATION" ? "#d97706" : "#dc2626"} pointerEvents="none"/> : null}{(index % labelEvery === 0 || index === points.length-1) ? <text x={x(index)} y={height-18} textAnchor="middle" fontSize="10" fill="#64748b">{point.label}</text> : null}</g>)}
      <text x={margin.left} y={18} fontSize="10" fill="#475569">Stops + packages · shared volume scale</text><text x={width-margin.right} y={18} textAnchor="end" fontSize="10" fill="#2563eb">Packages per stop in detail</text>
    </svg></div>
  </article>;
}
