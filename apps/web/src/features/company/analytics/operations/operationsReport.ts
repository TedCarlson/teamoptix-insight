import type { OperationsHistoryRow } from "../operationsHistory.types";
import {
  calculatePickupReliability,
  priTier,
  type PriTier,
} from "../pickupReliability";

export type ReportMetric = "routes" | "stops" | "packages" | "stopsPerRoute" | "packagesPerRoute" | "packagesPerStop";
export type ReportPeriod = { key: "30" | "60" | "90" | "contract"; label: string; days: number; metrics: Record<ReportMetric, number>; change: Record<ReportMetric, number | null> };
export type ReportWeek = { weekStart: string; weekEnd: string; isInProgress: boolean; operatingDays: number; routes: number; stops: number; packages: number; stopsPerRoute: number; packagesPerRoute: number; packagesPerStop: number; stopsChange: number | null; pickupStops: number; earlyPickups: number; latePickups: number; potentialMissedPickups: number; priComplete: boolean; weeklyPri: number | null; runningPri: number | null; runningTier: PriTier | null };
export type ReportDay = { date: string; routes: number; stops: number; packages: number; intensity: number };
export type OperationsReport = { periods: ReportPeriod[]; weeks: ReportWeek[]; days: ReportDay[]; narrative: string[]; throughDate: string | null; operatingDays: number };

const n = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : 0;
const ratio = (a: number, b: number) => b > 0 ? a / b : 0;
const change = (current: number, prior: number) => prior > 0 ? (current - prior) / prior : null;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`);
const addDays = (value: Date, amount: number) => { const next = new Date(value); next.setUTCDate(next.getUTCDate() + amount); return next; };
function pickupReliability(rows: OperationsHistoryRow[]) {
  const pickupStops = rows.reduce((sum, row) => sum + n(row.actual_pickup_stops), 0);
  const earlyPickups = rows.reduce((sum, row) => sum + n(row.early_pickups), 0);
  const latePickups = rows.reduce((sum, row) => sum + n(row.late_pickups), 0);
  const potentialMissedPickups = rows.reduce((sum, row) => sum + n(row.potential_missed_pickups), 0);
  const complete = rows.length > 0 && rows.every((row) => row.pickup_reliability_complete === true);
  return calculatePickupReliability({
    pickupStops,
    earlyPickups,
    latePickups,
    potentialMissedPickups,
    complete,
  });
}

function summarize(rows: OperationsHistoryRow[]): Record<ReportMetric, number> {
  const routes = rows.reduce((sum, row) => sum + n(row.route_count), 0);
  const stops = rows.reduce((sum, row) => sum + n(row.total_stops), 0);
  const packages = rows.reduce((sum, row) => sum + n(row.total_packages), 0);
  return { routes, stops, packages, stopsPerRoute: ratio(stops, routes), packagesPerRoute: ratio(packages, routes), packagesPerStop: ratio(packages, stops) };
}

function period(rows: OperationsHistoryRow[], through: Date, days: number, key: ReportPeriod["key"], label: string): ReportPeriod {
  const start = iso(addDays(through, -(days - 1)));
  const priorStart = iso(addDays(through, -(days * 2 - 1)));
  const priorEnd = iso(addDays(through, -days));
  const current = rows.filter((row) => row.service_date >= start && row.service_date <= iso(through));
  const prior = rows.filter((row) => row.service_date >= priorStart && row.service_date <= priorEnd);
  const metrics = summarize(current);
  const priorMetrics = summarize(prior);
  return { key, label, days: current.length, metrics, change: Object.fromEntries((Object.keys(metrics) as ReportMetric[]).map((metric) => [metric, change(metrics[metric], priorMetrics[metric])])) as Record<ReportMetric, number | null> };
}

function contractPeriod(rows: OperationsHistoryRow[]): ReportPeriod {
  const metrics = summarize(rows);
  const midpoint = Math.floor(rows.length / 2);
  const priorMetrics = summarize(rows.slice(0, midpoint));
  const currentMetrics = summarize(rows.slice(midpoint));
  return { key: "contract", label: "Contract", days: rows.length, metrics, change: Object.fromEntries((Object.keys(metrics) as ReportMetric[]).map((metric) => [metric, change(currentMetrics[metric], priorMetrics[metric])])) as Record<ReportMetric, number | null> };
}

function buildWeeks(rows: OperationsHistoryRow[]): ReportWeek[] {
  const map = new Map<string, OperationsHistoryRow[]>();
  const throughDate = rows.at(-1)?.service_date.slice(0, 10) ?? "";
  for (const row of rows) {
    const start = date(row.service_date); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 1) % 7));
    const key = iso(start); map.set(key, [...(map.get(key) ?? []), row]);
  }
  const weeks = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, weekRows]) => {
    const metrics = summarize(weekRows);
    const reliability = pickupReliability(weekRows);
    const weekEnd = iso(addDays(date(weekStart), 6));
    return { weekStart, weekEnd, isInProgress: throughDate >= weekStart && throughDate < weekEnd, operatingDays: weekRows.length, ...metrics, stopsChange: null, pickupStops: reliability.pickupStops, earlyPickups: reliability.earlyPickups, latePickups: reliability.latePickups, potentialMissedPickups: reliability.potentialMissedPickups, priComplete: reliability.complete, weeklyPri: reliability.pri, runningPri: null, runningTier: null, priNumerator: reliability.numerator };
  });
  let runningPickupStops = 0;
  let runningNumerator = 0;
  let runningComplete = true;

  return weeks.map((week, index) => {
    runningPickupStops += week.pickupStops;
    runningNumerator += week.priNumerator;
    runningComplete = runningComplete && week.priComplete;
    const runningPri = runningComplete && runningPickupStops > 0 ? runningNumerator / runningPickupStops : null;

    const { priNumerator, ...reportWeek } = week;

    return {
      ...reportWeek,
      stopsChange: index ? change(week.stops, weeks[index - 1].stops) : null,
      runningPri,
      runningTier: priTier(runningPri),
    };
  });
}

function pct(value: number | null) { return value == null ? "not yet comparable" : `${Math.abs(value * 100).toFixed(1)}% ${value >= 0 ? "higher" : "lower"}`; }

export function buildOperationsReport(input: OperationsHistoryRow[]): OperationsReport {
  const rows = [...input].filter((row) => Boolean(row.service_date)).sort((a, b) => a.service_date.localeCompare(b.service_date));
  if (!rows.length) return { periods: [], weeks: [], days: [], narrative: [], throughDate: null, operatingDays: 0 };
  const through = date(rows.at(-1)!.service_date);
  const periods = [period(rows, through, 30, "30", "30 days"), period(rows, through, 60, "60", "60 days"), period(rows, through, 90, "90", "90 days"), contractPeriod(rows)];
  const recent = periods[0];
  const routeChange = recent.change.routes;
  const stopChange = recent.change.stops;
  const packageChange = recent.change.packages;
  const densityChange = recent.change.stopsPerRoute;
  const direction = (stopChange ?? 0) >= 0 ? "increased" : "declined";
  const plan = routeChange != null && stopChange != null && Math.abs(routeChange - stopChange) <= 0.05
    ? "Route supply moved broadly in line with stop demand."
    : (densityChange ?? 0) > 0.05
      ? "Demand was absorbed primarily through more stops on each route rather than proportional route expansion."
      : (densityChange ?? 0) < -0.05
        ? "Route deployment expanded faster than stop demand, reducing average route load."
        : "Route load remained comparatively stable as demand moved.";
  return {
    periods,
    weeks: buildWeeks(rows),
    days: rows.map((row) => ({ date: row.service_date.slice(0, 10), routes: n(row.route_count), stops: n(row.total_stops), packages: n(row.total_packages), intensity: ratio(n(row.total_stops), n(row.route_count)) })),
    narrative: [
      `During the latest 30-day window, stop volume ${direction} ${pct(stopChange)} than the preceding 30 days; package volume was ${pct(packageChange)}.`,
      plan,
      `The contract record contains ${rows.length} finalized operating days. The 60- and 90-day views show whether the immediate movement is emerging or sustained.`,
    ],
    throughDate: iso(through),
    operatingDays: rows.length,
  };
}
