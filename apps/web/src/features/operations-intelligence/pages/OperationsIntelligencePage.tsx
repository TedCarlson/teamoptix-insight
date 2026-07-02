"use client";

import { useEffect, useMemo, useState } from "react";
import DemandTrendCard from "../components/DemandTrendCard";
import RouteHistoryGrid from "../components/RouteHistoryGrid";

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

type IntelligenceSummary = {
  demand?: {
    latest_service_date?: string | null;
    history_count?: number;
    signal?: string;
    latest?: { routes?: number; stops?: number; packages?: number };
    average?: { routes?: number; stops?: number; packages?: number };
    delta_pct?: { routes?: number; stops?: number; packages?: number };
  };
};

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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


const WEEKDAY_OPTIONS = [
  { key: 1, label: "Mon" },
  { key: 2, label: "Tue" },
  { key: 3, label: "Wed" },
  { key: 4, label: "Thu" },
  { key: 5, label: "Fri" },
  { key: 6, label: "Sat" },
  { key: 0, label: "Sun" },
] as const;

function weekdayIndex(dateIso: string) {
  return new Date(`${dateIso}T12:00:00.000Z`).getUTCDay();
}

function nextDateForWeekday(anchorDate: string, targetWeekday: number) {
  const current = weekdayIndex(anchorDate);
  const offset = (targetWeekday - current + 7) % 7;
  return addDaysIso(anchorDate, offset === 0 ? 7 : offset);
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
  const defaultTargetDate = addDaysIso(todayIso(), 1);
  const [selectedWeekday, setSelectedWeekday] = useState(weekdayIndex(defaultTargetDate));
  const targetDate = nextDateForWeekday(todayIso(), selectedWeekday);
  const historyDates = useMemo(() => sameWeekdayHistory(targetDate), [targetDate]);

  const [baselineRoutes, setBaselineRoutes] = useState<BaselineRoute[]>([]);
  const [days, setDays] = useState<DayResult[]>([]);
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
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

    async function loadSummary() {
      const res = await fetch(`/api/company/${slug}/operations/intelligence/summary`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!active) return;

      if (res.ok) {
        setSummary(data);
      }
    }

    void loadHistory().catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : "Failed to load route history.");
      setDays([]);
    });

    void loadSummary().catch(() => {
      if (!active) return;
      setSummary(null);
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

          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13, fontWeight: 850, maxWidth: 680 }}>
              Viewing the next {weekdayLabel(targetDate)} pattern. This grid shows the last 14 matching weekdays by route.
            </p>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {WEEKDAY_OPTIONS.map((option) => {
                const active = option.key === selectedWeekday;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedWeekday(option.key)}
                    className="button"
                    style={{
                      minHeight: 28,
                      padding: "0 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 950,
                      borderColor: active ? "#009b67" : "#d7e2f2",
                      background: active ? "#ecfdf5" : "#fff",
                      color: active ? "#047857" : "#475569",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {error ? (
          <section style={{ border: "1px solid #fecaca", borderRadius: 14, background: "#fef2f2", color: "#991b1b", padding: 12, fontWeight: 900 }}>
            {error}
          </section>
        ) : null}


        <DemandTrendCard summary={summary} />

        <RouteHistoryGrid
          grid={grid}
          historyDates={historyDates}
          weekdayLabel={weekdayLabel(targetDate)}
        />
      </section>
    </main>
  );
}
