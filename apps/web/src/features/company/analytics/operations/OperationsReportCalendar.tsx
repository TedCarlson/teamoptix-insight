"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CalendarOverlay,
  OperatingDayPoint,
} from "../operatingIntelligence";
import {
  buildOperatingCalendar,
  type CalendarDay,
} from "../OperatingCalendar/operatingCalendarModel";
import { operatingDayLabel } from "../OperatingCalendar/OperatingDay";
import styles from "./operations-report-calendar.module.css";
import type { ReportWeek } from "./operationsReport";

type CalendarWeekRow = {
  key: string;
  number: number;
  startDate: string;
  cells: Array<CalendarDay | null>;
};

type CalendarMonth = {
  key: string;
  label: string;
  rows: CalendarWeekRow[];
};

type ActiveWeek = {
  number: number;
  startDate: string;
};

const WEEKDAY_LABELS = ["Sa", "Su", "M", "T", "W", "Th", "F"];

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, amount: number): Date {
  const copy = new Date(value);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
}

function startOfOperatingWeek(value: Date): Date {
  const copy = new Date(value);
  const offset = (copy.getUTCDay() + 1) % 7;
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy;
}

function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatPri(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(3);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function formatRange(startDate: string, endDate: string): string {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  const startLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);

  const endLabel = new Intl.DateTimeFormat(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(end);

  return `${startLabel}–${endLabel}`;
}

function monthKeys(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];

  const keys: string[] = [];
  const cursor = parseDate(`${startDate.slice(0, 7)}-01`);
  const finalMonth = endDate.slice(0, 7);

  while (isoDate(cursor).slice(0, 7) <= finalMonth) {
    keys.push(isoDate(cursor).slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return keys;
}

function visualClass(day: CalendarDay): string {
  if (day.hasHistory && day.operatingMode === "supplemental") {
    return styles.supplemental;
  }

  if (day.hasHistory && day.operatingMode === "heavy") {
    return styles.heavy;
  }

  if (day.hasHistory && day.operatingMode === "exceptional") {
    return styles.exceptional;
  }

  if (day.hasHistory) return styles.standard;
  if (day.missingFinal) return styles.missing;
  return styles.nonOperating;
}

export default function OperationsReportCalendar({
  days,
  overlays,
  startDate,
  endDate,
  throughDate,
  contractYear,
  reportWeeks,
}: {
  days: OperatingDayPoint[];
  overlays: CalendarOverlay[];
  startDate: string;
  endDate: string;
  throughDate?: string | null;
  contractYear?: number | null;
  reportWeeks: ReportWeek[];
}) {
  const [activeDate, setActiveDate] = useState<string | null>(
    days.at(-1)?.serviceDate ?? null
  );
  const [activeWeek, setActiveWeek] =
    useState<ActiveWeek | null>(null);

  const calendarDays = useMemo(
    () =>
      buildOperatingCalendar({
        days,
        overlays,
        startDate,
        endDate,
        throughDate,
      }).flatMap((week) => week.days),
    [days, endDate, overlays, startDate, throughDate]
  );

  const calendarByDate = useMemo(
    () =>
      new Map(calendarDays.map((day) => [day.date, day])),
    [calendarDays]
  );

  useEffect(() => {
    if (!activeWeek) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveWeek(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeWeek]);

  const months = useMemo<CalendarMonth[]>(() => {
    if (!startDate || !endDate) return [];

    const contractWeekStart = startOfOperatingWeek(
      parseDate(startDate)
    );

    return monthKeys(startDate, endDate).map((monthKey) => {
      const firstOfMonth = parseDate(`${monthKey}-01`);
      const firstRowStart = startOfOperatingWeek(firstOfMonth);
      const rows: CalendarWeekRow[] = [];

      for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
        const rowStart = addDays(firstRowStart, rowIndex * 7);
        const cells = Array.from({ length: 7 }, (_, column) => {
          const date = isoDate(addDays(rowStart, column));

          if (
            date.slice(0, 7) !== monthKey ||
            date < startDate ||
            date > endDate
          ) {
            return null;
          }

          return calendarByDate.get(date) ?? null;
        });

        if (!cells.some(Boolean)) continue;

        rows.push({
          key: isoDate(rowStart),
          number:
            Math.floor(
              (rowStart.getTime() - contractWeekStart.getTime()) /
                604_800_000
            ) + 1,
          startDate: isoDate(rowStart),
          cells,
        });
      }

      return {
        key: monthKey,
        label: new Intl.DateTimeFormat(undefined, {
          month: "long",
          timeZone: "UTC",
        }).format(firstOfMonth),
        rows,
      };
    });
  }, [calendarByDate, endDate, startDate]);

  const selectedDate =
    activeDate && calendarByDate.has(activeDate)
      ? activeDate
      : days.at(-1)?.serviceDate ?? null;

  const activeDay = selectedDate
    ? calendarByDate.get(selectedDate) ?? null
    : null;

  const weekSummary = useMemo(() => {
    if (!activeWeek) return null;

    const start = parseDate(activeWeek.startDate);
    const weekDays = Array.from({ length: 7 }, (_, offset) =>
      calendarByDate.get(isoDate(addDays(start, offset)))
    ).filter((day): day is CalendarDay => Boolean(day));

    const historyDays = weekDays.filter((day) => day.hasHistory);
    const routes = historyDays.reduce(
      (sum, day) => sum + (day.routes ?? 0),
      0
    );
    const stops = historyDays.reduce(
      (sum, day) => sum + (day.stops ?? 0),
      0
    );
    const packages = historyDays.reduce(
      (sum, day) => sum + (day.packages ?? 0),
      0
    );
    const heavyDays = historyDays.filter(
      (day) => day.operatingMode === "heavy"
    ).length;
    const supplementalDays = historyDays.filter(
      (day) => day.operatingMode === "supplemental"
    ).length;
    const reportWeek = reportWeeks.find(
      (week) => week.weekStart === activeWeek.startDate
    );

    return {
      ...activeWeek,
      endDate: isoDate(addDays(start, 6)),
      operatingDays: historyDays.length,
      routes,
      stops,
      packages,
      stopsPerRoute: routes > 0 ? stops / routes : 0,
      pickupStops: reportWeek?.pickupStops ?? 0,
      earlyPickups: reportWeek?.earlyPickups ?? 0,
      latePickups: reportWeek?.latePickups ?? 0,
      potentialMissedPickups:
        reportWeek?.potentialMissedPickups ?? 0,
      priComplete: reportWeek?.priComplete ?? false,
      weeklyPri: reportWeek?.weeklyPri ?? null,
      runningPri: reportWeek?.runningPri ?? null,
      runningTier: reportWeek?.runningTier ?? null,
      reading:
        heavyDays > 0
          ? `${heavyDays} heavy operating ${heavyDays === 1 ? "day" : "days"}`
          : supplementalDays > 0
            ? `${supplementalDays} supplemental operating ${supplementalDays === 1 ? "day" : "days"}`
            : "Standard operating week",
    };
  }, [activeWeek, calendarByDate, reportWeeks]);

  function selectDay(day: CalendarDay) {
    setActiveDate(day.date);
    setActiveWeek(null);
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <p className="value-card__eyebrow">The operating record</p>
          <h2 className={styles.title}>Operating calendar</h2>
          <p className={styles.description}>
            The selected calendar range in one chronological view. Select a day
            for its operating slice or a week number for weekly totals.
          </p>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.contractYear}>
            <span>Calendar year</span>
            <strong>{contractYear ?? "—"}</strong>
          </div>
        </div>
      </header>

      <div className={styles.dayDetail} aria-live="polite">
        {activeDay ? (
          <>
            <div>
              <span>Selected day</span>
              <strong>{formatDate(activeDay.date)}</strong>
            </div>
            <div className={styles.dayMetrics}>
              {activeDay.hasHistory ? (
                <>
                  <span><strong>{formatNumber(activeDay.routes)}</strong> routes</span>
                  <span><strong>{formatNumber(activeDay.stops)}</strong> stops</span>
                  <span><strong>{formatNumber(activeDay.packages)}</strong> packages</span>
                  <span><strong>{activeDay.routes ? ((activeDay.stops ?? 0) / activeDay.routes).toFixed(1) : "—"}</strong> stops / route</span>
                </>
              ) : null}
              <b>{operatingDayLabel(activeDay)}</b>
            </div>
          </>
        ) : (
          <span>Select any day to read its FINAL operating record.</span>
        )}
      </div>

      <div className={styles.months}>
        {months.map((month) => (
          <section className={styles.month} key={month.key}>
            <h3>{month.label}</h3>
            <div className={styles.calendarGrid}>
              <span className={styles.weekHeading}>Wk</span>
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  className={styles.weekday}
                  key={`${month.key}-${label}-${index}`}
                >
                  {label}
                </span>
              ))}

              {month.rows.map((row) => (
                <div className={styles.weekRow} key={row.key}>
                  <button
                    type="button"
                    className={styles.weekNumber}
                    aria-label={`Open totals for range week ${row.number}`}
                    onClick={() =>
                      setActiveWeek({
                        number: row.number,
                        startDate: row.startDate,
                      })
                    }
                  >
                    {String(row.number).padStart(2, "0")}
                  </button>

                  {row.cells.map((day, index) =>
                    day ? (
                      <button
                        type="button"
                        className={[
                          styles.day,
                          visualClass(day),
                          day.peakSeason ? styles.peak : "",
                          selectedDate === day.date ? styles.selected : "",
                        ].filter(Boolean).join(" ")}
                        key={day.date}
                        aria-pressed={selectedDate === day.date}
                        aria-label={`${formatDate(day.date)}, ${operatingDayLabel(day)}${day.hasHistory ? `, ${formatNumber(day.routes)} routes, ${formatNumber(day.stops)} stops, ${formatNumber(day.packages)} packages` : ""}`}
                        title={`${formatDate(day.date)} · ${operatingDayLabel(day)}`}
                        onClick={() => selectDay(day)}
                      >
                        {Number(day.date.slice(8, 10))}
                      </button>
                    ) : (
                      <span
                        className={styles.blank}
                        key={`${row.key}-blank-${index}`}
                      />
                    )
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className={styles.legend} aria-label="Calendar legend">
        {[
          [styles.standard, "Standard"],
          [styles.heavy, "Heavy"],
          [styles.supplemental, "Supplemental"],
          [styles.exceptional, "Exceptional"],
          [styles.missing, "Missing FINAL"],
          [styles.nonOperating, "Non-operating"],
          [styles.peakMark, "Peak season"],
        ].map(([className, label]) => (
          <span key={label}>
            <i className={`${styles.legendMark} ${className}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      {weekSummary ? (
        <>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close weekly totals"
            onClick={() => setActiveWeek(null)}
          />
          <aside
            className={styles.weekRail}
            aria-label={`Range week ${weekSummary.number} totals`}
          >
            <header>
              <div>
                <p className="value-card__eyebrow">Weekly totals</p>
                <h3>Range week {String(weekSummary.number).padStart(2, "0")}</h3>
                <span>
                  {formatRange(weekSummary.startDate, weekSummary.endDate)} · Saturday–Friday
                </span>
              </div>
              <button
                type="button"
                aria-label="Close weekly totals"
                onClick={() => setActiveWeek(null)}
              >
                ×
              </button>
            </header>

            <div className={styles.weekTotals}>
              <div><span>Operating days</span><strong>{formatNumber(weekSummary.operatingDays)}</strong></div>
              <div><span>Routes operated</span><strong>{formatNumber(weekSummary.routes)}</strong></div>
              <div><span>Stops</span><strong>{formatNumber(weekSummary.stops)}</strong></div>
              <div><span>Packages</span><strong>{formatNumber(weekSummary.packages)}</strong></div>
              <div><span>Pickup stops</span><strong>{formatNumber(weekSummary.pickupStops)}</strong></div>
              <div><span>Early / late</span><strong>{formatNumber(weekSummary.earlyPickups)} / {formatNumber(weekSummary.latePickups)}</strong></div>
              <div><span>Potential missed</span><strong>{formatNumber(weekSummary.potentialMissedPickups)}</strong></div>
            </div>

            <div className={styles.weekTotals}>
              <div><span>Weekly PRI</span><strong>{formatPri(weekSummary.weeklyPri)}</strong></div>
              <div><span>Running total PRI</span><strong>{formatPri(weekSummary.runningPri)}</strong></div>
              <div><span>Running tier</span><strong>{weekSummary.runningTier ?? "—"}</strong></div>
            </div>

            {!weekSummary.priComplete ? (
              <div className={styles.weekReading}>
                <span>PRI data status</span>
                <strong>Awaiting historical sweep</strong>
                <p>This week will calculate automatically after its Early/Late pairs are healed.</p>
              </div>
            ) : null}

            <div className={styles.weekReading}>
              <span>Week reading</span>
              <strong>{weekSummary.reading}</strong>
              <p>
                {weekSummary.stopsPerRoute.toFixed(1)} stops per route across the selected operating week.
              </p>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
