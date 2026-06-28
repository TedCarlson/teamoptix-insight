import type { DispatchRoute } from "./dispatchSupport";

export type DroPlanRow = {
  route_baseline_id: string | null;
  route_name: string | null;
  wa_number: string | null;
  stops: number;
  packages: number;
  time_commits: number;
  miles: number | null;
  miles_per_stop: number | null;
  minutes_per_stop: number | null;
};

export type DispatchPlanSignal = {
  stops: number;
  packages: number;
  timeCritical: number;
  milesLabel: string;
  milesPerStopLabel: string;
  minutesPerStopLabel: string;
  title: string;
};

export type DroPlanTotals = {
  matchedRoutes: number;
  stops: number;
  packages: number;
  timeCritical: number;
  miles: number;
};

function numberLabel(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

export function timeCriticalColor(value: number) {
  if (value <= 0) return "#94a3b8";
  if (value <= 4) return "#334155";
  if (value <= 9) return "#d97706";
  return "#dc2626";
}

export function buildDroPlanSignals(routes: DispatchRoute[], rows: DroPlanRow[]) {
  const byWa = new Map<string, DroPlanRow>();
  const byName = new Map<string, DroPlanRow>();
  const planSignalsByRouteKey: Record<string, DispatchPlanSignal> = {};

  for (const row of rows) {
    if (row.wa_number) byWa.set(String(row.wa_number).trim(), row);
    if (row.route_name) byName.set(String(row.route_name).trim().toLowerCase(), row);
  }

  const planTotals: DroPlanTotals = {
    matchedRoutes: 0,
    stops: 0,
    packages: 0,
    timeCritical: 0,
    miles: 0,
  };

  for (const route of routes) {
    const wa = route.current_wa_num?.trim();
    const name = route.route_name?.trim().toLowerCase();
    const row = (wa ? byWa.get(wa) : null) ?? (name ? byName.get(name) : null);

    if (!row) continue;

    const milesLabel = row.miles === null ? "—" : String(Math.round(Number(row.miles)));
    const milesPerStopLabel = numberLabel(row.miles_per_stop, 1);
    const minutesPerStopLabel = numberLabel(row.minutes_per_stop, 1);

    const titleParts = [
      `${row.stops} stops`,
      `${row.packages} packages`,
      `${row.time_commits} time critical`,
    ];

    if (row.miles !== null) titleParts.push(`${Number(row.miles).toFixed(1)} miles`);
    if (row.miles_per_stop !== null) titleParts.push(`${Number(row.miles_per_stop).toFixed(2)} mi/stp`);
    if (row.minutes_per_stop !== null) titleParts.push(`${Number(row.minutes_per_stop).toFixed(1)} min/stp`);

    planSignalsByRouteKey[route.route_key] = {
      stops: row.stops,
      packages: row.packages,
      timeCritical: row.time_commits,
      milesLabel,
      milesPerStopLabel,
      minutesPerStopLabel,
      title: titleParts.join(" · "),
    };

    planTotals.matchedRoutes += 1;
    planTotals.stops += Number(row.stops ?? 0);
    planTotals.packages += Number(row.packages ?? 0);
    planTotals.timeCritical += Number(row.time_commits ?? 0);
    planTotals.miles += Number(row.miles ?? 0);
  }

  return { planSignalsByRouteKey, planTotals };
}
