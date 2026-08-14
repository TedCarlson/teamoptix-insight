"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  resolveBaselineScheduledOffDrivers,
  resolveDailyScheduleCapacity,
  resolveOverrideOffRows,
  scheduleRouteLabel,
  type ScheduleCapacityRoute,
} from "@/features/schedule/lib/scheduleCapacity";

type GeneratedScheduleRow = {
  id: string | null;
  service_date: string;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  planned_on: boolean;
  route_name: string | null;
  override_type: string | null;
};

function scheduleRowKey(row: GeneratedScheduleRow) {
  return row.id ?? `${row.service_date}:${row.roster_member_id}`;
}

const DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfSaturday(date: Date) {
  const copy = new Date(date);
  const offset = (copy.getDay() + 1) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}


function getDeltaSignal(
  delta: number,
  workforce: number,
  routeDemand: number
) {
  if (workforce === 0 && routeDemand === 0) {
    return {
      label: "No operation",
      background: "#f1f5f9",
      border: "#cbd5e1",
      color: "#64748b",
    };
  }

  if (delta < 0) {
    return {
      label: "Service risk",
      background: "#fee2e2",
      border: "#fca5a5",
      color: "#b91c1c",
    };
  }

  if (delta === 0) {
    return {
      label: "No contingency",
      background: "#fef3c7",
      border: "#fcd34d",
      color: "#92400e",
    };
  }

  if (delta <= 2) {
    return {
      label: "Target range",
      background: "#dcfce7",
      border: "#86efac",
      color: "#166534",
    };
  }

  if (delta <= 5) {
    return {
      label: "Labor high",
      background: "#fef3c7",
      border: "#fcd34d",
      color: "#92400e",
    };
  }

  return {
    label: "Profitability risk",
    background: "#fee2e2",
    border: "#fca5a5",
    color: "#b91c1c",
  };
}



export default function ScheduleCalendarPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [rows, setRows] = useState<GeneratedScheduleRow[]>([]);
  const [routes, setRoutes] = useState<ScheduleCapacityRoute[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = startOfSaturday(first);

    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  useEffect(() => {
    async function load() {
      const start = toIsoDate(calendarDays[0]);
      const end = toIsoDate(calendarDays[41]);

      const [scheduleRes, routesRes] = await Promise.all([
        fetch(
          `/api/company/${slug}/schedule/generated?start_date=${start}&end_date=${end}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        ),
        fetch(`/api/company/${slug}/routes`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const [scheduleData, routesData] = await Promise.all([
        scheduleRes.json().catch(() => ({})),
        routesRes.json().catch(() => ({})),
      ]);

      if (!scheduleRes.ok) {
        setError(scheduleData?.error ?? "Failed loading schedule.");
        return;
      }

      if (!routesRes.ok) {
        setError(routesData?.error ?? "Failed loading route demand.");
        return;
      }

      setRows(
        Array.isArray(scheduleData?.rows)
          ? (scheduleData.rows as GeneratedScheduleRow[])
          : []
      );

      setRoutes(
        Array.isArray(routesData?.routes)
          ? (routesData.routes as ScheduleCapacityRoute[])
          : []
      );

      setError(null);
    }

    if (slug) load();
  }, [slug, calendarDays]);

  const byDate = useMemo(() => {
    const map = new Map<string, GeneratedScheduleRow[]>();

    for (const row of rows) {
      const existing = map.get(row.service_date) ?? [];
      existing.push(row);
      map.set(row.service_date, existing);
    }

    return map;
  }, [rows]);

  return (
    <main className="workspace-shell">
      <section
        style={{
          width: "var(--app-page)",
          margin: "0 auto",
          padding: "24px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 style={{ margin: 0 }}>Schedule Calendar</h1>

          <div>
            <button
              className="button"
              onClick={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() - 1, 1)
                )
              }
            >
              ‹
            </button>

            <strong style={{ margin: "0 16px" }}>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </strong>

            <button
              className="button"
              onClick={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() + 1, 1)
                )
              }
            >
              ›
            </button>
          </div>
        </div>

        {error ? (
          <p style={{ color: "#c62828" }}>{error}</p>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 8,
            marginTop: 20,
          }}
        >
          {DAYS.map((day) => (
            <div key={day} style={{ fontWeight: 700 }}>
              {day}
            </div>
          ))}

          {calendarDays.map((day) => {
            const iso = toIsoDate(day);
            const dayRows = byDate.get(iso) ?? [];

            const capacity = resolveDailyScheduleCapacity({
              serviceDate: iso,
              routes,
              scheduleRows: dayRows,
            });

            const scheduledOffRows =
              resolveBaselineScheduledOffDrivers(dayRows);
            const scheduledOffCount = scheduledOffRows.length;
            const scheduledOffNames = scheduledOffRows
              .map((row) => row.full_name ?? "Unknown");

            const overrides = dayRows.filter(
              (row) => row.override_type
            ).length;

            const delta = capacity.capacityDelta;
            const deltaSignal = getDeltaSignal(
              delta,
              capacity.scheduledDrivers,
              capacity.routeDemand
            );
            const isToday = iso === toIsoDate(new Date());

            return (
              <div
                key={iso}
                className="schedule-calendar-day"
                onClick={() => setSelectedDate(iso)}
                style={{
                  cursor: "pointer",
                  minHeight: 132,
                  border: `1px solid ${
                    isToday
                      ? "#818cf8"
                      : delta < 0
                        ? "#fca5a5"
                        : "#d6dfeb"
                  }`,
                  borderRadius: 8,
                  padding: 10,
                  background:
                    day.getMonth() === month.getMonth()
                      ? "#fff"
                      : "#f8fafc",
                  boxShadow: isToday
                    ? "0 0 0 2px rgba(129,140,248,.18), 0 0 18px rgba(99,102,241,.18)"
                    : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    marginLeft: -10,
                    marginRight: -10,
                    marginTop: -10,
                    padding: "6px 10px",
                    background: isToday ? "#2563eb" : "transparent",
                    color: isToday ? "#fff" : "#334155",
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}
                >
                  {isToday ? (
                    <span
                      style={{
                        marginRight: "auto",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                      }}
                    >
                      TODAY
                    </span>
                  ) : null}

                  <strong
                    style={{
                      fontSize: 16,
                    }}
                  >
                    {day.getDate()}
                  </strong>
                </div>

                <div className="schedule-calendar-day__body" style={{ marginTop: 12, fontSize: 13 }}>
                  <div>
                    <strong>{capacity.routeDemand}</strong> routes
                  </div>

                  <div>
                    <strong>{capacity.scheduledDrivers}</strong> drivers
                  </div>

                  <div
                    title={
                      scheduledOffCount > 0
                        ? ["Scheduled off:", ...scheduledOffNames].join("\n")
                        : undefined
                    }
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 10,
                      fontSize: 12,
                      color: "#64748b",
                      cursor: scheduledOffCount > 0 ? "help" : "default",
                    }}
                  >
                    <span>
                      <strong>{scheduledOffCount}</strong> Sch Off
                    </span>
                    <span>
                      {overrides} change{overrides === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 14,
                        background: deltaSignal.background,
                        border: `1px solid ${deltaSignal.border}`,
                        color: deltaSignal.color,
                      }}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: deltaSignal.color,
                      }}
                    >
                      {deltaSignal.label}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {selectedDate ? (
          (() => {
            const selectedRows = byDate.get(selectedDate) ?? [];

            const capacity = resolveDailyScheduleCapacity({
              serviceDate: selectedDate,
              routes,
              scheduleRows: selectedRows,
            });

            const assignedDrivers = selectedRows.filter((row) => {
              const workerType = String(row.worker_type ?? "").toLowerCase();

              return (
                row.planned_on &&
                Boolean(row.route_name?.trim()) &&
                !workerType.includes("helper") &&
                !workerType.includes("jumper") &&
                !workerType.includes("trainee")
              );
            });

            const unassignedDrivers = capacity.standbyDrivers;
            const drawerSignal = getDeltaSignal(
              capacity.capacityDelta,
              capacity.scheduledDrivers,
              capacity.routeDemand
            );

            const scheduledOffRows =
              resolveBaselineScheduledOffDrivers(selectedRows);
            const overrideOffRows = resolveOverrideOffRows(selectedRows);

            return (
              <div
                className="schedule-day-drawer-backdrop"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(15,23,42,.25)",
                  display: "flex",
                  justifyContent: "flex-end",
                  zIndex: 50,
                }}
                onClick={() => setSelectedDate(null)}
              >
                <div
                  className="schedule-day-drawer"
                  style={{
                    width: 420,
                    maxWidth: "90vw",
                    background: "#fff",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    boxShadow: "-8px 0 24px rgba(0,0,0,.12)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      padding: 24,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      className="button"
                      onClick={() => setSelectedDate(null)}
                    >
                      Close
                    </button>

                    <h2 style={{ marginTop: 20 }}>
                      {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                        undefined,
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        }
                      )}
                    </h2>

                    <div style={{ marginTop: 20 }}>
                      <div>Routes running: {capacity.routeDemand}</div>
                      <div>Drivers scheduled: {capacity.scheduledDrivers}</div>
                      <div>Routes assigned: {capacity.assignedRoutes}</div>
                      <div>Routes open: {capacity.openRoutes.length}</div>
                      <div>
                        Delta: {capacity.capacityDelta >= 0 ? "+" : ""}
                        {capacity.capacityDelta}
                      </div>
                      <div style={{ fontWeight: 700, color: drawerSignal.color }}>
                        {drawerSignal.label}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      overflowY: "auto",
                      padding: "0 24px 24px",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: 18,
                        marginTop: 8,
                      }}
                    >
                      <section
                        className="schedule-day-drawer-section"
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            margin: "-12px -12px 10px",
                            padding: "8px 12px",
                            background: "#f1f5f9",
                            borderBottom: "1px solid #e2e8f0",
                            borderTopLeftRadius: 10,
                            borderTopRightRadius: 10,
                          }}
                        >
                          <strong>In Driver Seat</strong>
                          <span style={{ color: "#64748b" }}>
                            {assignedDrivers.length}
                          </span>
                        </div>

                        {assignedDrivers.map((row) => (
                          <div
                            key={scheduleRowKey(row)}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "6px 0",
                              borderBottom: "1px solid #e2e8f0",
                              fontSize: 14,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {row.full_name ?? "Unknown"}
                            </span>
                            <span style={{ color: "#64748b" }}>
                              {row.route_name ?? ""}
                            </span>
                          </div>
                        ))}
                      </section>

                      <section
                        className="schedule-day-drawer-section"
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <strong style={{ color: "#92400e" }}>
                            Stand By
                          </strong>
                          <span style={{ color: "#64748b" }}>
                            {unassignedDrivers.length}
                          </span>
                        </div>

                        {unassignedDrivers.length === 0 ? (
                          <div style={{ color: "#64748b" }}>
                            None
                          </div>
                        ) : (
                          unassignedDrivers.map((row) => (
                            <div
                              key={row.id ?? row.roster_member_id}
                              style={{
                                padding: "6px 0",
                                borderBottom: "1px solid #e2e8f0",
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              {row.full_name ?? "Unknown"}
                            </div>
                          ))
                        )}
                      </section>

                      <section
                        className="schedule-day-drawer-section"
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <strong style={{ color: "#475569" }}>
                            Scheduled Off
                          </strong>
                          <span style={{ color: "#64748b" }}>
                            {scheduledOffRows.length}
                          </span>
                        </div>

                        {scheduledOffRows.length === 0 ? (
                          <div style={{ color: "#64748b" }}>
                            None
                          </div>
                        ) : (
                          scheduledOffRows.map((row) => (
                            <div
                              key={scheduleRowKey(row)}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "6px 0",
                                borderBottom: "1px solid #e2e8f0",
                                fontSize: 14,
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {row.full_name ?? "Unknown"}
                              </span>
                            </div>
                          ))
                        )}
                      </section>

                      <section
                        className="schedule-day-drawer-section"
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <strong style={{ color: "#475569" }}>
                            Override Off
                          </strong>
                          <span style={{ color: "#64748b" }}>
                            {overrideOffRows.length}
                          </span>
                        </div>

                        {overrideOffRows.length === 0 ? (
                          <div style={{ color: "#64748b" }}>
                            None
                          </div>
                        ) : (
                          overrideOffRows.map((row) => (
                            <div
                              key={scheduleRowKey(row)}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "6px 0",
                                borderBottom: "1px solid #e2e8f0",
                                fontSize: 14,
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {row.full_name ?? "Unknown"}
                              </span>
                              <span style={{ color: "#64748b" }}>
                                {row.override_type ?? ""}
                              </span>
                            </div>
                          ))
                        )}
                      </section>

                      <section
                        className="schedule-day-drawer-section"
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <strong style={{ color: "#b91c1c" }}>
                            Routes Without Drivers
                          </strong>
                          <span style={{ color: "#64748b" }}>
                            {capacity.openRoutes.length}
                          </span>
                        </div>

                        {capacity.openRoutes.length === 0 ? (
                          <div style={{ color: "#64748b" }}>
                            None
                          </div>
                        ) : (
                          capacity.openRoutes.map((route) => (
                            <div
                              key={route.id}
                              style={{
                                padding: "6px 0",
                                borderBottom: "1px solid #e2e8f0",
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              {scheduleRouteLabel(route)}
                            </div>
                          ))
                        )}
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}

      </section>
    </main>
  );
}
