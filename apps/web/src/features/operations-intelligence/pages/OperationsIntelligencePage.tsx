"use client";

import { useEffect, useMemo, useState } from "react";

type Props = { slug: string };

type DswRow = {
  service_date?: string | null;
  route_baseline_id?: string | null;
  route_name?: string | null;
  wa_number?: string | null;
  driver_name?: string | null;
  actual_delivery_stops?: number | string | null;
  actual_delivery_packages?: number | string | null;
  miles?: number | string | null;
  on_duty_hours?: number | string | null;
  on_road_hours?: number | string | null;
};

type BaselineRoute = {
  id?: string | null;
  route_name?: string | null;
  route_key?: string | null;
  current_wa_num?: string | null;
};

type DayResult = {
  date: string;
  rows: DswRow[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function shortDate(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function sameWeekdayHistory(targetDate: string, count = 14) {
  return Array.from({ length: count }, (_, index) =>
    addDaysIso(targetDate, -7 * (index + 1))
  );
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: number, digits = 0) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function baselineRouteKey(route: BaselineRoute) {
  return String(route.current_wa_num ?? route.route_name ?? route.route_key ?? route.id ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function baselineRouteLabel(route: BaselineRoute) {
  const name = String(route.route_name ?? route.route_key ?? "Unlabeled route");
  const wa = String(route.current_wa_num ?? "").trim();
  return wa ? `${name} · ${wa}` : name;
}

function routeKey(row: DswRow) {
  return String(row.wa_number ?? row.route_name ?? row.route_baseline_id ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function routeLabel(row: DswRow) {
  const name = String(row.route_name ?? "Unlabeled route");
  const wa = String(row.wa_number ?? "").trim();
  return wa ? `${name} · ${wa}` : name;
}

function rowMetric(row: DswRow | null) {
  return {
    stops: n(row?.actual_delivery_stops),
    packages: n(row?.actual_delivery_packages),
    miles: n(row?.miles),
    duty: n(row?.on_duty_hours),
  };
}

function avg(values: number[]) {
  const clean = values.filter((value) => value > 0);
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export default function OperationsIntelligencePage({ slug }: Props) {
  const targetDate = addDaysIso(todayIso(), 1);
  const historyDates = useMemo(() => sameWeekdayHistory(targetDate), [targetDate]);

  const [baselineRoutes, setBaselineRoutes] = useState<BaselineRoute[]>([]);
  const [days, setDays] = useState<DayResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setError(null);

      const routesRes = await fetch(`/api/company/${slug}/routes`, {
        credentials: "include",
        cache: "no-store",
      });
      const routesData = await routesRes.json().catch(() => ({}));

      if (!routesRes.ok) {
        throw new Error(routesData?.error ?? "Failed to load baseline routes.");
      }

      const params = new URLSearchParams();
      for (const date of historyDates) {
        params.append("date", date);
      }

      const historyRes = await fetch(
        `/api/company/${slug}/operations/intelligence/route-history?${params.toString()}`,
        { credentials: "include", cache: "no-store" }
      );

      const historyData = await historyRes.json().catch(() => ({}));

      if (!historyRes.ok) {
        throw new Error(historyData?.error ?? "Failed to load route history.");
      }

      const rows = Array.isArray(historyData?.rows) ? historyData.rows : [];
      const rowsByDate = new Map<string, DswRow[]>();

      for (const date of historyDates) {
        rowsByDate.set(date, []);
      }

      for (const row of rows) {
        const date = String(row.service_date ?? "").slice(0, 10);
        if (!date) continue;
        const bucket = rowsByDate.get(date) ?? [];
        bucket.push(row);
        rowsByDate.set(date, bucket);
      }

      if (!active) return;
      setBaselineRoutes(Array.isArray(routesData?.routes) ? routesData.routes : []);
      setDays(historyDates.map((date) => ({ date, rows: rowsByDate.get(date) ?? [] })));
    }

    void loadHistory().catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : "Failed to load route history.");
      setDays([]);
    });

    return () => {
      active = false;
    };
  }, [historyDates, slug]);

  const grid = useMemo(() => {
    const routeLabels = new Map<string, string>();
    const rowsByDate = new Map<string, Map<string, DswRow>>();

    for (const day of days) {
      const map = new Map<string, DswRow>();

      for (const row of day.rows) {
        const key = routeKey(row);
        if (!key) continue;

        map.set(key, row);
        if (!routeLabels.has(key)) routeLabels.set(key, routeLabel(row));
      }

      rowsByDate.set(day.date, map);
    }

    const baselineEntries = baselineRoutes
      .map((route) => [baselineRouteKey(route), baselineRouteLabel(route)] as const)
      .filter(([key]) => key);

    const mergedLabels = new Map<string, string>(baselineEntries);

    for (const [key, label] of routeLabels.entries()) {
      if (!mergedLabels.has(key)) mergedLabels.set(key, label);
    }

    return Array.from(mergedLabels.entries())
      .map(([key, label]) => {
        const cells = historyDates.map((date) => {
          const row = rowsByDate.get(date)?.get(key) ?? null;
          return { date, ...rowMetric(row) };
        });

        return {
          key,
          label,
          cells,
          avgStops: avg(cells.map((cell) => cell.stops)),
          avgPackages: avg(cells.map((cell) => cell.packages)),
          avgMiles: avg(cells.map((cell) => cell.miles)),
          avgDuty: avg(cells.map((cell) => cell.duty)),
          runs: cells.filter((cell) => cell.stops || cell.packages || cell.miles || cell.duty).length,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [baselineRoutes, days, historyDates]);

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 8, display: "grid", gap: 10 }}>
        <header style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Operations Intelligence
            </p>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.1 }}>
              {weekdayLabel(targetDate)} route history
            </h1>
          </div>

          <p style={{ margin: 0, color: "#64748b", fontSize: 13, fontWeight: 850, maxWidth: 680 }}>
            Tomorrow is {weekdayLabel(targetDate)}. This grid shows the last 14 matching weekdays by route.
          </p>
        </header>

        {error ? (
          <section style={{ border: "1px solid #fecaca", borderRadius: 14, background: "#fef2f2", color: "#991b1b", padding: 12, fontWeight: 900 }}>
            {error}
          </section>
        ) : null}

        <section style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #e6edf5", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Dimension 1
              </p>
              <strong>Last 14 {weekdayLabel(targetDate)}s by route</strong>
            </div>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
              {grid.length} routes · {historyDates[historyDates.length - 1]} through {historyDates[0]}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5", minWidth: 190 }}>Route</th>
                  <th style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5" }}>Runs</th>
                  <th style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5" }}>Avg Stops</th>
                  <th style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5" }}>Avg Pkgs</th>
                  <th style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5" }}>Avg Miles</th>
                  <th style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5" }}>Avg Duty</th>
                  {historyDates.map((date) => (
                    <th key={date} style={{ padding: "9px 10px", borderBottom: "1px solid #e6edf5", minWidth: 82 }}>
                      {shortDate(date)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {grid.map((row) => (
                  <tr key={row.key} style={{ borderBottom: "1px solid #eef2f7" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 950 }}>{row.label}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 850 }}>{row.runs}/14</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(row.avgStops, 1)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(row.avgPackages, 1)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(row.avgMiles, 1)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(row.avgDuty, 1)}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} style={{ padding: "8px 10px", color: cell.stops ? "#0f172a" : "#94a3b8" }}>
                        {cell.stops ? (
                          <span>
                            <strong>{fmt(cell.stops)}</strong>
                            <span style={{ color: "#64748b" }}> / {fmt(cell.packages)}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {!grid.length ? (
                  <tr>
                    <td colSpan={20} style={{ padding: 14, color: "#64748b", fontWeight: 850 }}>
                      Loading baseline routes and same-weekday DSW history.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
