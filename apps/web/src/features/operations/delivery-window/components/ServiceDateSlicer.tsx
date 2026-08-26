"use client";

import { useEffect, useMemo, useState } from "react";

type CalendarDay = {
  service_date: string;
  status: "final" | "in_day" | "inactive" | "empty";
};

function monthStart(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

function addMonths(dateIso: string, months: number) {
  const date = new Date(`${monthStart(dateIso)}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function monthLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart(dateIso)}T12:00:00.000Z`));
}

function fullDate(dateIso: string) {
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
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export default function ServiceDateSlicer({
  slug,
  value,
  maximum,
  onChange,
}: {
  slug: string;
  value: string;
  maximum: string;
  onChange: (date: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(monthStart(value));
  const [days, setDays] = useState<CalendarDay[]>([]);
  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);
  const statusByDate = useMemo(
    () => new Map(days.map((day) => [day.service_date, day.status])),
    [days]
  );

  useEffect(() => {
    setVisibleMonth(monthStart(value));
  }, [value]);

  useEffect(() => {
    if (!calendarOpen) return;
    const controller = new AbortController();

    async function loadProductionDays() {
      const params = new URLSearchParams({
        startDate: cells[0],
        endDate: cells[cells.length - 1],
      });

      try {
        const response = await fetch(
          `/api/company/${slug}/operations/reports/daily-operations-calendar?${params.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          days?: CalendarDay[];
        };
        if (!response.ok) throw new Error("Unable to load production dates.");
        setDays(Array.isArray(payload.days) ? payload.days : []);
      } catch {
        if (!controller.signal.aborted) setDays([]);
      }
    }

    void loadProductionDays();
    return () => controller.abort();
  }, [calendarOpen, cells, slug]);

  function choose(date: string) {
    if (!date || date > maximum) return;
    onChange(date);
    setCalendarOpen(false);
  }

  return (
    <section
      aria-label="Service report date"
      style={{
        position: "relative",
        border: "1px solid #dbe4ef",
        borderRadius: 16,
        background: "#fff",
        marginBottom: 10,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ display: "grid", gap: 2 }}>
        <small
          style={{
            color: "#15805f",
            fontSize: 10,
            fontWeight: 950,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Service date authority
        </small>
        <strong style={{ color: "#0f172a", fontSize: 15 }}>
          {fullDate(value)}
        </strong>
        <small style={{ color: "#64748b", fontWeight: 800 }}>
          DSW, FCC, routes, manifests, and route evidence use this date.
        </small>
      </span>

      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          aria-label="Choose service date"
          type="date"
          value={value}
          max={maximum}
          onChange={(event) => choose(event.target.value)}
          style={{
            minHeight: 38,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#fff",
            color: "#0f172a",
            padding: "0 10px",
            fontWeight: 900,
          }}
        />
        <button
          type="button"
          className="button"
          aria-expanded={calendarOpen}
          onClick={() => setCalendarOpen((current) => !current)}
        >
          {calendarOpen ? "Close calendar" : "Production calendar"}
        </button>
      </span>

      {calendarOpen ? (
        <div
          style={{
            position: "absolute",
            zIndex: 40,
            right: 12,
            top: "calc(100% + 6px)",
            width: "min(360px, calc(100vw - 32px))",
            border: "1px solid #cbd5e1",
            borderRadius: 16,
            background: "#fff",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.2)",
            padding: 12,
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "36px 1fr 36px",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <button
              type="button"
              className="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
            >
              ‹
            </button>
            <strong>{monthLabel(visibleMonth)}</strong>
            <button
              type="button"
              className="button"
              aria-label="Next month"
              disabled={visibleMonth >= monthStart(maximum)}
              onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
            >
              ›
            </button>
          </div>

          <div
            aria-hidden="true"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 4,
              color: "#64748b",
              fontSize: 9,
              fontWeight: 950,
              textAlign: "center",
            }}
          >
            {['S', 'U', 'M', 'T', 'W', 'H', 'F'].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 4,
            }}
          >
            {cells.map((dateIso) => {
              const inMonth = dateIso.slice(0, 7) === visibleMonth.slice(0, 7);
              const hasProduction = ["final", "in_day"].includes(
                statusByDate.get(dateIso) ?? "empty"
              );
              const selected = dateIso === value;
              const selectable = inMonth && dateIso <= maximum;

              return (
                <button
                  type="button"
                  key={dateIso}
                  disabled={!selectable}
                  aria-label={`${fullDate(dateIso)} · ${
                    hasProduction ? "Production available" : "No production report"
                  }`}
                  aria-pressed={selected}
                  onClick={() => choose(dateIso)}
                  style={{
                    minHeight: 34,
                    border: selected
                      ? "2px solid #0f766e"
                      : hasProduction
                        ? "1px solid #6ee7b7"
                        : "1px solid #e2e8f0",
                    borderRadius: 9,
                    background: hasProduction ? "#ecfdf5" : "#fff",
                    color: hasProduction ? "#166534" : "#475569",
                    opacity: selectable ? 1 : 0.28,
                    fontSize: 11,
                    fontWeight: 950,
                  }}
                >
                  {Number(dateIso.slice(-2))}
                </button>
              );
            })}
          </div>

          <small style={{ color: "#64748b", fontWeight: 800 }}>
            <i
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                marginRight: 5,
                borderRadius: 999,
                background: "#6ee7b7",
              }}
            />
            Green dates have production evidence.
          </small>
        </div>
      ) : null}
    </section>
  );
}
