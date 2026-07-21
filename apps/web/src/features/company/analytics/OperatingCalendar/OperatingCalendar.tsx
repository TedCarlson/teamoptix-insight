"use client";

import { useMemo, useState } from "react";
import type { CalendarOverlay, OperatingDayPoint } from "../operatingIntelligence";
import { OperatingWeek } from "./OperatingWeek";
import {
  buildOperatingCalendar,
  type CalendarDay,
} from "./operatingCalendarModel";
import { operatingDayLabel } from "./OperatingDay";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function LegendMark({ kind }: { kind: "standard" | "heavy" | "supplemental" | "exceptional" | "missing" | "non-operating" }) {
  const common: React.CSSProperties = { width: 12, height: 12, borderRadius: 3, display: "inline-block" };
  const styles: Record<typeof kind, React.CSSProperties> = {
    standard: { ...common, background: "#64748b", border: "1px solid #475569" },
    heavy: { ...common, background: "repeating-linear-gradient(135deg, #312e81 0, #312e81 3px, #4338ca 3px, #4338ca 6px)", border: "1px solid #312e81" },
    supplemental: { ...common, background: "#2563eb", border: "1px solid #1d4ed8" },
    exceptional: { ...common, background: "transparent", border: "2px solid #dc2626" },
    missing: { ...common, background: "transparent", border: "2px dashed #f59e0b" },
    "non-operating": { ...common, background: "repeating-linear-gradient(135deg, #f1f5f9 0, #f1f5f9 3px, #e2e8f0 3px, #e2e8f0 6px)", border: "1px solid #e2e8f0" },
  };

  return <span aria-hidden="true" style={styles[kind]} />;
}

export function OperatingCalendar({
  days,
  overlays,
  startDate,
  endDate,
  throughDate,
}: {
  days: OperatingDayPoint[];
  overlays: CalendarOverlay[];
  startDate: string;
  endDate: string;
  throughDate?: string | null;
}) {
  const [activeDay, setActiveDay] = useState<CalendarDay | null>(null);
  const weeks = useMemo(
    () => buildOperatingCalendar({ days, overlays, startDate, endDate, throughDate }),
    [days, overlays, startDate, endDate, throughDate]
  );

  return (
    <article className="app-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 18px 0" }}>
        <p className="value-card__eyebrow">Operating pattern</p>
        <h3 className="app-card__title" style={{ fontSize: 19 }}>Operating Calendar</h3>
        <p className="app-card__body" style={{ marginTop: 6 }}>
          Every contract-period calendar day is retained in a fixed seven-day week. FINAL operating history, expected non-operating days, missing FINAL records, and Peak Season remain visually distinct.
        </p>
      </div>

      <div style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 10,
            scrollSnapType: "x proximity",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {weeks.map((week) => (
            <OperatingWeek
              key={week.key}
              week={week}
              activeDate={activeDay?.date ?? null}
              onActivate={setActiveDay}
              onDeactivate={() => setActiveDay(null)}
            />
          ))}
        </div>

        <div
          aria-live="polite"
          style={{
            minHeight: 58,
            marginTop: 2,
            padding: "10px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            background: "#f8fafc",
            color: "#475569",
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          {activeDay ? (
            <>
              <strong style={{ color: "#0f172a" }}>{formatDate(activeDay.date)}</strong>
              <span>{` · ${operatingDayLabel(activeDay)}`}</span>
              {activeDay.hasHistory ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 2 }}>
                  <span><strong>{formatNumber(activeDay.routes)}</strong> routes</span>
                  <span><strong>{formatNumber(activeDay.stops)}</strong> stops</span>
                  <span><strong>{formatNumber(activeDay.packages)}</strong> packages</span>
                </div>
              ) : null}
            </>
          ) : (
            "Hover or focus any day slot to inspect its calendar state and FINAL operating totals."
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", marginTop: 12 }}>
          {([
            ["standard", "Standard"],
            ["heavy", "Heavy"],
            ["supplemental", "Supplemental"],
            ["exceptional", "Exceptional"],
            ["missing", "Missing FINAL"],
            ["non-operating", "Non-operating"],
          ] as const).map(([kind, label]) => (
            <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#475569", fontSize: 11, fontWeight: 800 }}>
              <LegendMark kind={kind} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
