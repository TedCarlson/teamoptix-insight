"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccess } from "@/features/access/AccessProvider";

type DriverScheduleCalendarProps = {
  slug: string;
};

type ScheduleRow = {
  roster_member_id: string;
  profile_id?: string | null;
  full_name?: string | null;
  default_route_s?: string | null;
  default_route_u?: string | null;
  default_route_m?: string | null;
  default_route_t?: string | null;
  default_route_w?: string | null;
  default_route_h?: string | null;
  default_route_f?: string | null;
  preset_works_s?: boolean | null;
  preset_works_u?: boolean | null;
  preset_works_m?: boolean | null;
  preset_works_t?: boolean | null;
  preset_works_w?: boolean | null;
  preset_works_h?: boolean | null;
  preset_works_f?: boolean | null;
  rotation_works_s?: boolean | null;
  rotation_works_u?: boolean | null;
  rotation_works_m?: boolean | null;
  rotation_works_t?: boolean | null;
  rotation_works_w?: boolean | null;
  rotation_works_h?: boolean | null;
  rotation_works_f?: boolean | null;
  schedule_pending?: boolean | null;
};

type CalendarState = "ROUTE" | "ON" | "OFF" | "CALL_OUT" | "ADD_IN";

type CalendarCell = {
  key: string;
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekendColumn: boolean;
  status: CalendarState;
  label: string;
};

const routeByDayKey: Record<number, keyof ScheduleRow> = {
  0: "default_route_s",
  1: "default_route_m",
  2: "default_route_t",
  3: "default_route_w",
  4: "default_route_h",
  5: "default_route_f",
  6: "default_route_u",
};

const presetWorksByDayKey: Record<number, keyof ScheduleRow> = {
  0: "preset_works_s",
  1: "preset_works_m",
  2: "preset_works_t",
  3: "preset_works_w",
  4: "preset_works_h",
  5: "preset_works_f",
  6: "preset_works_u",
};

const rotationWorksByDayKey: Record<number, keyof ScheduleRow> = {
  0: "rotation_works_s",
  1: "rotation_works_m",
  2: "rotation_works_t",
  3: "rotation_works_w",
  4: "rotation_works_h",
  5: "rotation_works_f",
  6: "rotation_works_u",
};

const calendarWeekdays = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthTitle(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function routeForDate(row: ScheduleRow | null, date: Date) {
  if (!row || row.schedule_pending) return null;

  const routeKey = routeByDayKey[date.getDay()];
  const rawRoute = row[routeKey];

  return typeof rawRoute === "string" && rawRoute.trim() ? rawRoute.trim() : null;
}

function isScheduledForDate(row: ScheduleRow | null, date: Date) {
  if (!row || row.schedule_pending) return false;

  const presetKey = presetWorksByDayKey[date.getDay()];
  const rotationKey = rotationWorksByDayKey[date.getDay()];

  return row[rotationKey] === true || row[presetKey] === true;
}

function statusForDate(row: ScheduleRow | null, date: Date): Pick<CalendarCell, "status" | "label"> {
  const route = routeForDate(row, date);
  const scheduled = isScheduledForDate(row, date);

  if (route) {
    return { status: "ROUTE", label: route };
  }

  if (scheduled) {
    return { status: "ON", label: "ON" };
  }

  return { status: "OFF", label: "OFF" };
}

function startOfFedExCalendarGrid(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const day = firstOfMonth.getDay();
  const offsetFromSaturday = (day + 1) % 7;

  return addDays(firstOfMonth, -offsetFromSaturday);
}

function buildCalendarCells(monthDate: Date, row: ScheduleRow | null) {
  const today = new Date();
  const gridStart = startOfFedExCalendarGrid(monthDate);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const col = index % 7;
    const state = statusForDate(row, date);

    return {
      key: date.toISOString(),
      date,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isToday: sameDate(date, today),
      isWeekendColumn: col === 0 || col === 1,
      ...state,
    };
  });
}

export function DriverScheduleCalendar({ slug }: DriverScheduleCalendarProps) {
  const access = useAccess();
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSchedule() {
      try {
        setLoading(true);
        setPageError(null);

        const res = await fetch(`/api/company/${slug}/schedule`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setRows([]);
          setPageError(data?.error ?? "Schedule is not available yet.");
          return;
        }

        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (!active) return;
        setRows([]);
        setPageError("Schedule is not available yet.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void loadSchedule();

    return () => {
      active = false;
    };
  }, [slug]);

  const myScheduleRow = useMemo(() => {
    if (!access.profile_id) return null;
    return rows.find((row) => row.profile_id === access.profile_id) ?? null;
  }, [access.profile_id, rows]);

  const calendarCells = useMemo(
    () => buildCalendarCells(monthDate, myScheduleRow),
    [monthDate, myScheduleRow]
  );

  function moveMonth(direction: -1 | 1) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function returnToday() {
    setMonthDate(new Date());
  }

  return (
    <section className="app-card company-user-card driver-calendar-card">
      <div className="driver-calendar-header">
        <div>
          <p className="value-card__eyebrow">Schedule</p>
          <h2>{monthTitle(monthDate)}</h2>
        </div>

        <div className="driver-calendar-actions">
          <div className="driver-calendar-nav" aria-label="Calendar navigation">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <button type="button" onClick={returnToday}>
            Today
          </button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
            ›
          </button>
          </div>
        </div>
      </div>

      {pageError ? (
        <p className="company-user-muted">{pageError}</p>
      ) : (
        <div className="driver-calendar-shell" aria-busy={loading}>
          <div className="driver-calendar-weekdays">
            {calendarWeekdays.map((day, index) => (
              <span
                key={day}
                className={index === 0 || index === 1 ? "driver-calendar-weekend-column" : ""}
              >
                {day}
              </span>
            ))}
          </div>

          <div className="driver-calendar-grid">
            {calendarCells.map((day) => (
              <button
                key={day.key}
                type="button"
                className={[
                  "driver-calendar-day",
                  `driver-calendar-day--${day.status.toLowerCase()}`,
                  day.isToday ? "driver-calendar-day--today" : "",
                  day.isCurrentMonth ? "" : "driver-calendar-day--muted",
                  day.isWeekendColumn ? "driver-calendar-day--weekend" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <strong>{day.dayNumber}</strong>
                <small>{day.label}</small>
              </button>
            ))}
          </div>

          <div className="driver-calendar-legend">
            <span><i className="driver-calendar-dot driver-calendar-dot--route" />On / Route</span>
            <span><i className="driver-calendar-dot driver-calendar-dot--off" />Off</span>
            <span><i className="driver-calendar-dot driver-calendar-dot--call-out" />Call out</span>
            <span><i className="driver-calendar-dot driver-calendar-dot--add-in" />Add-in</span>
          </div>
        </div>
      )}
    </section>
  );
}
