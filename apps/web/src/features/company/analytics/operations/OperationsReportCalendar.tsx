"use client";

import { useMemo, useState } from "react";
import type { ReportDay } from "./operationsReport";

const monthName = (value: string) => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const number = (value: number) => new Intl.NumberFormat().format(value);

export default function OperationsReportCalendar({ days }: { days: ReportDay[] }) {
  const [active, setActive] = useState<ReportDay | null>(days.at(-1) ?? null);
  const months = useMemo(() => {
    const map = new Map<string, ReportDay[]>();
    for (const day of days) { const key = day.date.slice(0, 7); map.set(key, [...(map.get(key) ?? []), day]); }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [days]);
  const maximum = Math.max(...days.map((day) => day.intensity), 1);

  return (
    <section style={{ borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1", padding: "26px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "end", flexWrap: "wrap" }}>
        <div><p className="value-card__eyebrow">The operating record</p><h2 style={{ margin: "5px 0 0", fontSize: 28, letterSpacing: "-.025em" }}>Contract operating calendar</h2><p className="app-card__body" style={{ marginTop: 7, maxWidth: 720 }}>Each mark is a FINAL DSW operating day. Darker days carried more stops per route; select a day to read its operating record.</p></div>
        {active ? <div style={{ minWidth: 270, borderLeft: "3px solid #1d4ed8", paddingLeft: 14 }}><strong>{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${active.date}T12:00:00Z`))}</strong><div style={{ marginTop: 5, color: "#475569", fontSize: 13 }}>{number(active.routes)} routes · {number(active.stops)} stops · {number(active.packages)} packages</div><div style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 800 }}>{active.intensity.toFixed(1)} stops per route</div></div> : null}
      </div>
      <div style={{ display: "grid", gap: 22, marginTop: 24 }}>
        {months.map(([month, monthDays]) => {
          const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
          const byDate = new Map(monthDays.map((day) => [Number(day.date.slice(8, 10)), day]));
          const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
          return <div key={month}><h3 style={{ margin: "0 0 9px", fontSize: 15 }}>{monthName(`${month}-01`)}</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(36px, 1fr))", gap: 5 }}>{["S","M","T","W","T","F","S"].map((label, index) => <span key={`${label}-${index}`} style={{ fontSize: 10, fontWeight: 900, color: "#94a3b8", textAlign: "center" }}>{label}</span>)}{Array.from({ length: first }).map((_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((dayNumber) => { const day = byDate.get(dayNumber); const selected = active?.date === day?.date; return <button key={dayNumber} type="button" disabled={!day} onClick={() => day && setActive(day)} title={day ? `${day.stops} stops` : "No FINAL operating record"} style={{ height: 42, borderRadius: 6, border: selected ? "2px solid #0f172a" : "1px solid #e2e8f0", background: day ? `rgba(37, 99, 235, ${0.12 + (day.intensity / maximum) * 0.78})` : "#f8fafc", color: day && day.intensity / maximum > .55 ? "white" : "#64748b", fontWeight: 800, cursor: day ? "pointer" : "default" }}>{dayNumber}</button>; })}</div></div>;
        })}
      </div>
    </section>
  );
}
