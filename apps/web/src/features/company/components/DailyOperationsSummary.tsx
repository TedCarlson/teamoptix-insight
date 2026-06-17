"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type CalendarStatus = "final" | "in_day" | "inactive" | "empty";

type CalendarDay = {
  service_date: string;
  status: CalendarStatus;
};

type SummaryPayload = {
  company_name: string;
  service_date: string;
  company_identity: {
    contract_number: string | null;
    terminal_identity: string | null;
    service_area: string | null;
    status: string | null;
    effective_start_date: string | null;
    effective_end_date: string | null;
  } | null;
  summary: {
    batch_id: string;
    source_filename: string | null;
    created_at: string | null;
    summary_label?: string | null;
    terminal_code?: string | null;
    route_count: number;
    normalized_row_json: Record<string, unknown>;
  } | null;
};

type ReportMetric = {
  label: string;
  current: string;
  signal?: "up" | "down" | "neutral";
  average?: string;
};

function todayNyIso() {
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

function monthStart(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

function addMonths(dateIso: string, months: number) {
  const d = new Date(`${monthStart(dateIso)}T12:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart(dateIso)}T12:00:00.000Z`));
}

function dateLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function calendarCells(monthIso: string) {
  const first = new Date(`${monthStart(monthIso)}T12:00:00.000Z`);
  const startOffset = (first.getUTCDay() + 1) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + index);
    return d.toISOString().slice(0, 10);
  });
}

function n(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function fmt(value: unknown, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n(value));
}

function pct(value: number) {
  return `${value.toFixed(3)}%`;
}

function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

function signalFor(current: number, average: number, higherIsGood = true): ReportMetric["signal"] {
  if (!average || Math.abs(current - average) < 0.001) return "neutral";
  return higherIsGood ? (current > average ? "up" : "down") : current < average ? "up" : "down";
}

function signalGlyph(signal?: ReportMetric["signal"]) {
  if (signal === "up") return <span style={{ color: "#16a34a", fontWeight: 950 }}>▲</span>;
  if (signal === "down") return <span style={{ color: "#ef4444", fontWeight: 950 }}>▼</span>;
  return <span style={{ color: "#94a3b8", fontWeight: 950 }}>▬</span>;
}

function statusStyle(status: CalendarStatus, selected: boolean): CSSProperties {
  const base: CSSProperties = {
    height: 26,
    minWidth: 26,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    background: "#fff",
  };

  if (status === "final") Object.assign(base, { background: "#ecfdf5", borderColor: "#16a34a", color: "#166534" });
  if (status === "in_day") Object.assign(base, { background: "#fffbeb", borderColor: "#f59e0b", color: "#92400e" });
  if (status === "inactive") Object.assign(base, { background: "#f8fafc", color: "#94a3b8", textDecoration: "line-through" });
  if (selected) Object.assign(base, { outline: "2px solid #0f172a", outlineOffset: 1 });

  return base;
}

function ReportSection(props: { title: string; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        border: "1px solid #d7e2f2",
        borderRadius: 14,
        background: "#ffffff",
        padding: 12,
        ...props.style,
      }}
    >
      <h3
        style={{
          margin: 0,
          color: "#0f172a",
          fontSize: 12,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {props.title}
      </h3>
      <div style={{ marginTop: 9 }}>{props.children}</div>
    </section>
  );
}

function SimpleMetricRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, color: "#334155", fontSize: 13 }}>
          <span style={{ fontStyle: "italic" }}>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function RouteStatsGrid({ metrics }: { metrics: ReportMetric[] }) {
  return (
    <div style={{ display: "grid", gap: 4, color: "#334155", fontSize: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 22px 64px", gap: 8, fontSize: 11, fontWeight: 900, color: "#64748b" }}>
        <span />
        <span style={{ textAlign: "right" }}>VALUE</span>
        <span />
        <span style={{ textAlign: "right" }}>AVG</span>
      </div>
      {metrics.map((metric) => (
        <div key={metric.label} style={{ display: "grid", gridTemplateColumns: "1fr 64px 22px 64px", gap: 8 }}>
          <span style={{ fontStyle: "italic" }}>{metric.label}</span>
          <strong style={{ textAlign: "right" }}>{metric.current}</strong>
          <span style={{ textAlign: "center" }}>{metric.average ? signalGlyph(metric.signal) : null}</span>
          <strong style={{ textAlign: "right" }}>{metric.average ?? ""}</strong>
        </div>
      ))}
    </div>
  );
}

function CodePerformanceGrid({
  rows,
}: {
  rows: Array<{ label: string; count: string; rate: string; target: string; status: "meets" | "watch" | "miss" | "na" }>;
}) {
  const statusLabel = {
    meets: "Meets",
    watch: "Watch",
    miss: "Miss",
    na: "n/a",
  } as const;

  return (
    <div style={{ display: "grid", gap: 5, color: "#334155", fontSize: 13 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 58px 72px 78px 58px", gap: 8, fontSize: 11, fontWeight: 900, color: "#64748b" }}>
        <span>Metric</span>
        <span style={{ textAlign: "right" }}>Count</span>
        <span style={{ textAlign: "right" }}>Rate</span>
        <span style={{ textAlign: "right" }}>Target</span>
        <span style={{ textAlign: "right" }}>Signal</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 58px 72px 78px 58px", gap: 8 }}>
          <span style={{ fontStyle: "italic" }}>{row.label}</span>
          <strong style={{ textAlign: "right" }}>{row.count}</strong>
          <strong style={{ textAlign: "right" }}>{row.rate}</strong>
          <span style={{ textAlign: "right" }}>{row.target}</span>
          <strong
            style={{
              textAlign: "right",
              color: row.status === "meets" ? "#15803d" : row.status === "miss" ? "#b91c1c" : row.status === "watch" ? "#92400e" : "#64748b",
            }}
          >
            {statusLabel[row.status]}
          </strong>
        </div>
      ))}
    </div>
  );
}

function SignalRow(props: { tone: "clear" | "watch" | "risk"; title: string; detail: string }) {
  const toneStyle =
    props.tone === "clear"
      ? { bg: "#ffffff", border: "#d7e2f2", fg: "#166534", dot: "#22c55e" }
      : props.tone === "watch"
        ? { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", dot: "#f59e0b" }
        : { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", dot: "#ef4444" };

  return (
    <div
      style={{
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.bg,
        borderRadius: 12,
        padding: "8px 10px",
        display: "grid",
        gridTemplateColumns: "10px 1fr",
        gap: 8,
        alignItems: "start",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: toneStyle.dot,
          marginTop: 5,
        }}
      />
      <span>
        <strong style={{ display: "block", color: toneStyle.fg, fontSize: 12 }}>{props.title}</strong>
        <span style={{ display: "block", color: "#475569", fontSize: 12, marginTop: 2 }}>{props.detail}</span>
      </span>
    </div>
  );
}

export default function DailyOperationsSummary({ slug }: { slug: string }) {
  const today = todayNyIso();
  const defaultDate = addDaysIso(today, -1);

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [visibleMonth, setVisibleMonth] = useState(monthStart(defaultDate));
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calendarMap = useMemo(
    () => new Map(calendarDays.map((day) => [day.service_date, day.status])),
    [calendarDays]
  );

  useEffect(() => {
    let active = true;

    async function loadCalendar() {
      const startDate = addDaysIso(today, -540);
      const endDate = today;

      const res = await fetch(
        `/api/company/${slug}/operations/reports/daily-operations-calendar?startDate=${startDate}&endDate=${endDate}`,
        { cache: "no-store", credentials: "include" }
      );
      const data = await res.json();

      if (!active) return;
      setCalendarDays(data.days ?? []);
    }

    void loadCalendar();

    return () => {
      active = false;
    };
  }, [slug, today]);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setError(null);

      const res = await fetch(`/api/company/${slug}/operations/reports/daily-operations-summary?date=${selectedDate}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();

      if (!active) return;

      if (!res.ok) {
        setPayload(null);
        setError(data?.error ?? "Failed to load Daily Operations Summary.");
        return;
      }

      setPayload(data);
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [slug, selectedDate]);

  const summary = payload?.summary;
  const row = summary?.normalized_row_json ?? {};

  const routes = n(summary?.route_count);
  const vscan = n(row.vscan_packages);
  const delStops = n(row.planned_delivery_stops);
  const puStops = n(row.planned_pickup_stops);
  const actDelStops = n(row.actual_delivery_stops);
  const actDelPkgs = n(row.actual_delivery_packages);
  const actPuStops = n(row.actual_pickup_stops);
  const actPuPkgs = n(row.actual_pickup_packages);
  const diff = n(row.diff);

  const rls = n(row.required_signature);
  const ils = n(row.ils_impact_packages);
  const code85 = n(row.code_85);
  const allCodes = n(row.all_status_code_packages);
  const dna = n(row.dna);
  const exceptions = n(row.exceptions);
  const ilsPercent = n(row.ils_percent);

  const avgVscan = safeDiv(vscan, routes);
  const avgDelStops = safeDiv(delStops, routes);
  const avgPuStops = safeDiv(puStops, routes);
  const avgDiff = safeDiv(diff, routes);
  const avgActDelStops = safeDiv(actDelStops, routes);
  const avgActDelPkgs = safeDiv(actDelPkgs, routes);
  const avgActPuStops = safeDiv(actPuStops, routes);
  const avgActPuPkgs = safeDiv(actPuPkgs, routes);

  const routeStats: ReportMetric[] = [
    { label: "ROUTES", current: fmt(routes) },
    { label: "VScan PKGS", current: fmt(avgVscan, 1), signal: signalFor(avgVscan, 100), average: "100" },
    { label: "DEL STPS", current: fmt(avgDelStops, 1), signal: signalFor(avgDelStops, 66), average: "66" },
    { label: "PU STPS", current: fmt(avgPuStops, 1), signal: signalFor(avgPuStops, 2), average: "2" },
    { label: "DIFF", current: fmt(avgDiff, 1), signal: signalFor(avgDiff, 2, false), average: "2" },
    { label: "ACT DEL STOPS", current: fmt(avgActDelStops, 1), signal: signalFor(avgActDelStops, 63), average: "63" },
    { label: "ACT DEL PKGS", current: fmt(avgActDelPkgs, 1), signal: signalFor(avgActDelPkgs, 96), average: "96" },
    { label: "ACT PU STPS", current: fmt(avgActPuStops, 1), signal: signalFor(avgActPuStops, 2), average: "2" },
    { label: "ACT PU PKGS", current: fmt(avgActPuPkgs, 1), signal: signalFor(avgActPuPkgs, 9), average: "9" },
  ];

  const rlsRate = 100 - safeDiv(rls, vscan) * 100;
  const code85Rate = safeDiv(code85, vscan) * 100;
  const allCodesRate = safeDiv(allCodes, vscan) * 100;
  const dnaRate = safeDiv(dna, vscan) * 100;
  const exceptionRate = safeDiv(exceptions, vscan) * 100;

  const codeRows = [
    { label: "RLS", count: fmt(rls), rate: pct(rlsRate), target: "> 98.00%", status: rlsRate >= 98 ? "meets" as const : "miss" as const },
    { label: "ILS", count: fmt(ils), rate: pct(ilsPercent), target: "> 99.50%", status: ilsPercent >= 99.5 ? "meets" as const : "miss" as const },
    { label: "CODE 85", count: fmt(code85), rate: pct(code85Rate), target: "< 0.200%", status: code85Rate < 0.2 ? "meets" as const : "watch" as const },
    { label: "ALL CODES", count: fmt(allCodes), rate: pct(allCodesRate), target: "< 0.200%", status: allCodesRate < 0.2 ? "meets" as const : "miss" as const },
    { label: "DNA", count: fmt(dna), rate: pct(dnaRate), target: "< 1.500%", status: dnaRate < 1.5 ? "meets" as const : "miss" as const },
    { label: "EXCEPTIONS", count: fmt(exceptions), rate: pct(exceptionRate), target: "n/a", status: "na" as const },
  ];

  const identity = payload?.company_identity ?? null;
  const terminalIdentity =
    summary?.terminal_code ||
    String(row.terminal_identity ?? "") ||
    identity?.terminal_identity ||
    "Pending";

  const serviceArea = identity?.service_area?.trim() || "Pending";

  const reportMeta = [
    ["Service date", dateLabel(selectedDate)],
    ["Source", summary ? "DSW FINAL" : "Awaiting FINAL"],
    ["Terminal", terminalIdentity],
    ["Service area", serviceArea],
    ["Generated", summary?.created_at ? new Date(summary.created_at).toLocaleString() : "Pending"],
  ];

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(190px, 224px)",
        gap: 14,
        alignItems: "start",
      }}
    >
      <section style={{ border: "1px solid #d7e2f2", borderRadius: 18, background: "#fff", padding: 16, boxShadow: "0 16px 32px rgba(15, 23, 42, 0.04)" }}>
          <header style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 10, marginBottom: 12 }}>
            <div style={{ display: "grid", gap: 2 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>{payload?.company_name ?? "Company"}</h2>
              <div style={{ fontSize: 18, fontWeight: 750, color: "#475569" }}>
                Daily Operations Summary
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
              {reportMeta.map(([label, value]) => (
                <div key={label} style={{ borderLeft: "3px solid #d7e2f2", paddingLeft: 8 }}>
                  <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                  <strong style={{ color: "#0f172a", fontSize: 12 }}>{value}</strong>
                </div>
              ))}
            </div>
          </header>

          {error ? <p style={{ color: "#c62828", fontWeight: 900 }}>{error}</p> : null}

          {!summary ? (
            <ReportSection title="Report artifact">
              <strong>No FINAL DSW artifact found for {selectedDate}.</strong>
            </ReportSection>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <section style={{ display: "grid", gridTemplateColumns: "1.25fr 1.4fr", gap: 14 }}>
                <ReportSection title="Volume">
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <div
                          style={{
                            color: "#0369a1",
                            background: "#e0f2fe",
                            border: "1px solid #bae6fd",
                            borderRadius: 999,
                            display: "inline-flex",
                            padding: "3px 9px",
                            fontSize: 11,
                            fontWeight: 950,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginBottom: 7,
                          }}
                        >
                          Tendered
                        </div>
                        <SimpleMetricRows
                          rows={[
                            ["Packages", fmt(vscan)],
                            ["Stops", fmt(delStops)],
                            ["Pickups", fmt(puStops)],
                          ]}
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            color: "#047857",
                            background: "#d1fae5",
                            border: "1px solid #a7f3d0",
                            borderRadius: 999,
                            display: "inline-flex",
                            padding: "3px 9px",
                            fontSize: 11,
                            fontWeight: 950,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            marginBottom: 7,
                          }}
                        >
                          Completed
                        </div>
                        <SimpleMetricRows
                          rows={[
                            ["Packages", fmt(actDelPkgs)],
                            ["Stops", fmt(actDelStops)],
                            ["Pickups", fmt(actPuStops)],
                          ]}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        borderTop: "1px dashed #cbd5e1",
                        paddingTop: 8,
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                          Variance
                        </div>
                        <SimpleMetricRows rows={[["Diff", fmt(diff)]]} />
                      </div>

                      <div>
                        <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                          Pickup packages
                        </div>
                        <SimpleMetricRows rows={[["Actual PU PKGS", fmt(actPuPkgs)]]} />
                      </div>
                    </div>
                  </div>
                </ReportSection>

                <ReportSection title="Route Performance">
                  <RouteStatsGrid metrics={routeStats} />
                </ReportSection>
              </section>

              <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <ReportSection title="Code Performance">
                  <CodePerformanceGrid rows={codeRows} />
                </ReportSection>

                <ReportSection title="Watchlist">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div
                      style={{
                        border: "1px dashed #cbd5e1",
                        borderRadius: 12,
                        padding: "9px 10px",
                        background: "#f8fafc",
                        color: "#475569",
                        fontSize: 12,
                        lineHeight: 1.35,
                      }}
                    >
                      <strong style={{ display: "block", color: "#0f172a", marginBottom: 3 }}>
                        No active operational concerns detected.
                      </strong>
                      This area surfaces pickup flags, helper-login signals, routes not dispatched, DOT-hour risks, and other operational exceptions.
                    </div>

                  </div>
                </ReportSection>
              </section>

              <ReportSection title="Delivery Actions">
                <p style={{ margin: 0, color: "#334155", fontSize: 13 }}>
                  Driver assists, route rescues, package transfers, coverage actions, and supervisor interventions will surface here once the delivery actions seam is active.
                </p>
              </ReportSection>


              <footer style={{ borderTop: "1px solid #d7e2f2", paddingTop: 6, color: "#64748b", fontSize: 11, fontStyle: "italic", textAlign: "center" }}>
                Disclaimer: The P&amp;D results section reflects pickup and delivery data as recorded through the source artifact and does not reflect later reconciliation adjustments.
              </footer>
            </div>
          )}
        </section>

        <aside style={{ position: "sticky", top: 12 }}>
          <section style={{ border: "1px solid #d7e2f2", borderRadius: 16, background: "#fff", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <button className="button" type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} style={{ width: 30, height: 30, padding: 0 }}>‹</button>
              <strong style={{ fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{monthLabel(visibleMonth)}</strong>
              <button className="button" type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} style={{ width: 30, height: 30, padding: 0 }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 10, color: "#64748b", fontWeight: 900 }}>
              {["S", "U", "M", "T", "W", "H", "F"].map((d, index) => (
                <span key={`${d}-${index}`} style={{ textAlign: "center" }}>{d}</span>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 4 }}>
              {calendarCells(visibleMonth).map((dateIso, index) => {
                const inMonth = dateIso.slice(0, 7) === visibleMonth.slice(0, 7);
                const status = calendarMap.get(dateIso) ?? "empty";
                const isWeekendColumn = index % 7 <= 1;

                return (
                  <button
                    key={dateIso}
                    type="button"
                    disabled={!inMonth}
                    onClick={() => setSelectedDate(dateIso)}
                    style={{
                      ...statusStyle(status, selectedDate === dateIso),
                      boxShadow: isWeekendColumn ? "inset 0 0 0 999px rgba(15, 23, 42, 0.025)" : undefined,
                      opacity: inMonth ? 1 : 0.22,
                    }}
                  >
                    {Number(dateIso.slice(-2))}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: 4, marginTop: 10, color: "#64748b", fontSize: 11, fontWeight: 800 }}>
              <span>🟢 Final report</span>
              <span>🟠 In-day only</span>
              <span>⚪ No record</span>
            </div>
          </section>
      </aside>
    </section>
  );
}
