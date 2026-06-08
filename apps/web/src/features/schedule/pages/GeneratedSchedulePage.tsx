"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type GeneratedScheduleRow = {
  id: string;
  company_id: string;
  terminal_id: string;
  service_date: string;
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: string | null;
  market_code: string | null;
  reports_to_name: string | null;
  planned_on: boolean;
  route_name: string | null;
  source_kind: string;
  preset_id: string | null;
  preset_code: string | null;
  rotation_mode: string | null;
  anchor_date: string | null;
  baseline_id: string | null;
  override_id: string | null;
  override_type: string | null;
  override_start_date: string | null;
  override_end_date: string | null;
  route_name_override: string | null;
  created_at: string;
};

type WorkerWeekRow = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  employment_status: string | null;
  market_code: string | null;
  byDate: Record<string, GeneratedScheduleRow | undefined>;
};

const DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const GRID_MIN_WIDTH = 980;
const WORKER_COL_WIDTH = 210;
const STICKY_HEADER_TOP = 0;

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfBusinessWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const daysSinceSaturday = (day + 1) % 7;
  copy.setDate(copy.getDate() - daysSinceSaturday);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatHeaderDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatWeekLabel(weekStart: Date) {
  const end = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function buildWeekDates(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      iso: toIsoDate(date),
      label: DAYS[index],
      display: formatHeaderDate(toIsoDate(date)),
    };
  });
}

function getCellValue(row: GeneratedScheduleRow | undefined) {
  if (!row) return "—";
  if (!row.planned_on) return "—";
  return row.route_name?.trim() || "ON";
}

function getCellStyles(row: GeneratedScheduleRow | undefined, value: string) {
  if (!row) {
    return {
      shellBackground: "#fff",
      shellInset: "none",
      tileBorder: "#d6dfeb",
      valueColor: "#94a3b8",
      label: null as string | null,
      labelBackground: "#fff",
      labelBorder: "#d6dfeb",
      labelColor: "#64748b",
    };
  }

  if (row.override_type === "ADD_IN") {
    return {
      shellBackground: "#f0fdf4",
      shellInset: "inset 0 0 0 1px #bbf7d0",
      tileBorder: "#22c55e",
      valueColor: "#166534",
      label: "ADD-IN",
      labelBackground: "#dcfce7",
      labelBorder: "#86efac",
      labelColor: "#166534",
    };
  }

  if (row.override_type === "CALL_OUT") {
    return {
      shellBackground: "#fef2f2",
      shellInset: "inset 0 0 0 1px #fecaca",
      tileBorder: "#ef4444",
      valueColor: value === "—" ? "#b91c1c" : "#b91c1c",
      label: "CALL-OUT",
      labelBackground: "#fee2e2",
      labelBorder: "#fca5a5",
      labelColor: "#b91c1c",
    };
  }

  if (row.override_type === "TIME_OFF") {
    return {
      shellBackground: "#fff7ed",
      shellInset: "inset 0 0 0 1px #fed7aa",
      tileBorder: "#f97316",
      valueColor: value === "—" ? "#c2410c" : "#c2410c",
      label: "TIME OFF",
      labelBackground: "#ffedd5",
      labelBorder: "#fdba74",
      labelColor: "#c2410c",
    };
  }

  return {
    shellBackground: "#fff",
    shellInset: "none",
    tileBorder: "#d6dfeb",
    valueColor: value === "—" ? "#94a3b8" : "#0f172a",
    label: null as string | null,
    labelBackground: "#fff",
    labelBorder: "#d6dfeb",
    labelColor: "#64748b",
  };
}

function buildCellTitle(
  workerName: string,
  dayLabel: string,
  dayDisplay: string,
  row: GeneratedScheduleRow | undefined,
  value: string
) {
  if (!row) {
    return `${workerName} · ${dayLabel} ${dayDisplay}`;
  }

  const parts = [`${workerName} · ${dayLabel} ${dayDisplay}`, value];

  if (row.override_type) {
    parts.push(`override ${row.override_type}`);
  } else {
    parts.push(`source ${row.source_kind}`);
  }

  return parts.join(" · ");
}

export default function GeneratedSchedulePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [rows, setRows] = useState<GeneratedScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfBusinessWeek(new Date())
  );

  useEffect(() => {
    let active = true;

    async function loadGeneratedSchedule() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/schedule/generated`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load generated schedule.");
          setRows([]);
          return;
        }

        setRows((data?.rows ?? []) as GeneratedScheduleRow[]);
      } catch {
        if (!active) return;
        setError("Generated schedule request failed.");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) loadGeneratedSchedule();

    return () => {
      active = false;
    };
  }, [slug]);

  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);
  const weekStartIso = weekDates[0]?.iso;
  const weekEndIso = weekDates[6]?.iso;

  const weekRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rowsInWeek = rows.filter(
      (row) => row.service_date >= weekStartIso && row.service_date <= weekEndIso
    );

    const grouped = new Map<string, WorkerWeekRow>();

    for (const row of rowsInWeek) {
      if (!row.full_name?.trim()) {
        continue;
      }

      const workerId = row.roster_member_id;
      const existing = grouped.get(workerId);

      if (existing) {
        existing.byDate[row.service_date] = row;
        continue;
      }

      grouped.set(workerId, {
        roster_member_id: workerId,
        full_name: row.full_name.trim(),
        worker_type: row.worker_type,
        employment_status: row.employment_status,
        market_code: row.market_code,
        byDate: {
          [row.service_date]: row,
        },
      });
    }

    let values = Array.from(grouped.values()).sort((a, b) =>
      a.full_name.localeCompare(b.full_name)
    );

    if (!q) return values;

    return values.filter((row) => {
      return (
        row.full_name.toLowerCase().includes(q) ||
        (row.worker_type ?? "").toLowerCase().includes(q) ||
        (row.market_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, weekStartIso, weekEndIso]);

  const totalAssignments = useMemo(() => {
    return weekRows.reduce((count, worker) => {
      return (
        count +
        weekDates.filter((day) => Boolean(worker.byDate[day.iso]?.planned_on)).length
      );
    }, 0);
  }, [weekRows, weekDates]);

  const weekOverrideSummary = useMemo(() => {
    let addInCount = 0;
    let callOutCount = 0;
    let timeOffCount = 0;

    for (const row of rows) {
      if (row.service_date < weekStartIso || row.service_date > weekEndIso) continue;
      if (row.override_type === "ADD_IN") addInCount += 1;
      if (row.override_type === "CALL_OUT") callOutCount += 1;
      if (row.override_type === "TIME_OFF") timeOffCount += 1;
    }

    return { addInCount, callOutCount, timeOffCount };
  }, [rows, weekStartIso, weekEndIso]);

  function goPrevWeek() {
    setWeekStart((current) => addDays(current, -7));
  }

  function goNextWeek() {
    setWeekStart((current) => addDays(current, 7));
  }

  function goCurrentWeek() {
    setWeekStart(startOfBusinessWeek(new Date()));
  }

  return (
    <main className="workspace-shell">
      <section
        style={{
          width: "min(1440px, calc(100% - 24px))",
          margin: "0 auto",
          padding: "18px 0 8px",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "grid", gap: 0 }}>
          <p
            className="eyebrow"
            style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em" }}
          >
            Schedule
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            Weekly Calendar
          </h1>
        </div>

        <article className="value-card" style={{ padding: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <p className="value-card__eyebrow">Week</p>
                <h3 className="value-card__title" style={{ marginBottom: 0 }}>
                  {formatWeekLabel(weekStart)}
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    flexWrap: "wrap",
                    fontSize: 14,
                    color: "#475569",
                  }}
                >
                  <span>
                    <strong>Workers:</strong> {weekRows.length}
                  </span>
                  <span>
                    <strong>Assignments:</strong> {totalAssignments}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <LegendPill label="Baseline" />
                <LegendPill
                  label="Add-in"
                  background="#dcfce7"
                  border="#86efac"
                  color="#166534"
                />
                <LegendPill
                  label="Call-out"
                  background="#fee2e2"
                  border="#fca5a5"
                  color="#b91c1c"
                />
                <LegendPill
                  label="Time off"
                  background="#ffedd5"
                  border="#fdba74"
                  color="#c2410c"
                />
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  {weekOverrideSummary.addInCount} add-ins ·{" "}
                  {weekOverrideSummary.callOutCount} call-outs ·{" "}
                  {weekOverrideSummary.timeOffCount} time-off
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="Search worker or market..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  height: 40,
                  minWidth: 220,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid #d6dfeb",
                  background: "#fff",
                }}
              />
              <button className="button" type="button" onClick={goPrevWeek}>
                Prev week
              </button>
              <button className="button" type="button" onClick={goCurrentWeek}>
                Current
              </button>
              <button className="button" type="button" onClick={goNextWeek}>
                Next week
              </button>
            </div>
          </div>
        </article>
      </section>

      <section className="value-strip" style={{ paddingTop: 6 }}>
        <div className="value-grid">
          {error ? (
            <article
              className="value-card"
              style={{ gridColumn: "1 / -1", padding: "12px 16px" }}
            >
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          <article
            className="value-card"
            style={{
              gridColumn: "1 / -1",
              padding: 0,
              overflow: "hidden",
              width: "100%",
            }}
          >
            {loading ? (
              <div style={{ padding: 24 }}>Loading generated schedule...</div>
            ) : weekRows.length === 0 ? (
              <div style={{ padding: 24 }}>
                No generated schedule rows found for this week.
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  overflowX: "auto",
                  overflowY: "auto",
                  maxHeight: "calc(100vh - 260px)",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    minWidth: GRID_MIN_WIDTH,
                    display: "grid",
                    gridTemplateColumns: `${WORKER_COL_WIDTH}px repeat(7, minmax(0, 1fr))`,
                  }}
                >
                  <div
                    style={{
                      position: "sticky",
                      top: STICKY_HEADER_TOP,
                      left: 0,
                      zIndex: 4,
                      background: "#f8fafc",
                      borderBottom: "1px solid #d6dfeb",
                      borderRight: "1px solid #d6dfeb",
                      padding: "10px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#5c6b84",
                    }}
                  >
                    Worker
                  </div>

                  {weekDates.map((day) => (
                    <div
                      key={day.iso}
                      style={{
                        position: "sticky",
                        top: STICKY_HEADER_TOP,
                        zIndex: 3,
                        background: "#f8fafc",
                        borderBottom: "1px solid #d6dfeb",
                        borderRight: "1px solid #d6dfeb",
                        padding: "10px 8px",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "#5c6b84",
                      }}
                    >
                      <div>{day.label}</div>
                      <div style={{ marginTop: 2, fontSize: 13, color: "#0f172a" }}>
                        {day.display}
                      </div>
                    </div>
                  ))}

                  {weekRows.map((worker) => (
                    <LeanRow
                      key={worker.roster_member_id}
                      worker={worker}
                      weekDates={weekDates}
                    />
                  ))}
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}

function LegendPill(props: {
  label: string;
  background?: string;
  border?: string;
  color?: string;
}) {
  const {
    label,
    background = "#ffffff",
    border = "#d6dfeb",
    color = "#475569",
  } = props;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "0 10px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background,
        color,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

function LeanRow(props: {
  worker: WorkerWeekRow;
  weekDates: Array<{ iso: string; label: string; display: string }>;
}) {
  const { worker, weekDates } = props;

  return (
    <>
      <div
        style={{
          position: "sticky",
          left: 0,
          zIndex: 2,
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          borderBottom: "1px solid #e2e8f0",
          padding: "8px 12px",
        }}
      >
        <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.08 }}>
          {worker.full_name}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
          {[worker.worker_type, worker.market_code].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      {weekDates.map((day) => {
        const row = worker.byDate[day.iso];
        const value = getCellValue(row);
        const styles = getCellStyles(row, value);

        return (
          <div
            key={`${worker.roster_member_id}:${day.iso}`}
            style={{
              borderRight: "1px solid #e2e8f0",
              borderBottom: "1px solid #e2e8f0",
              padding: 4,
              minHeight: 58,
              background: styles.shellBackground,
              boxShadow: styles.shellInset,
            }}
          >
            <div
              style={{
                border: `1px solid ${styles.tileBorder}`,
                borderRadius: 8,
                padding: styles.label ? "4px 6px 6px" : "4px 6px",
                background: "#fff",
                minHeight: 42,
                display: "grid",
                alignItems: "center",
                justifyItems: "center",
                gap: styles.label ? 4 : 0,
              }}
              title={buildCellTitle(worker.full_name, day.label, day.display, row, value)}
            >
              {styles.label ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 18,
                    padding: "0 6px",
                    borderRadius: 999,
                    border: `1px solid ${styles.labelBorder}`,
                    background: styles.labelBackground,
                    color: styles.labelColor,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.03em",
                    lineHeight: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {styles.label}
                </span>
              ) : null}

              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: styles.valueColor,
                }}
              >
                {value}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}