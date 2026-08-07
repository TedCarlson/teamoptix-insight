"use client";

import { useMemo, useState } from "react";

type HistoryCell = {
  date: string;
  stops: number;
  packages: number;
  miles: number;
  duty: number;
};

type RouteHistoryRow = {
  key: string;
  label: string;
  cells: HistoryCell[];
  avgStops: number;
  avgPackages: number;
  avgMiles: number;
  avgDuty: number;
  runs: number;
};

function fmt(value: number, digits = 0) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function shortDate(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

export default function RouteHistoryGrid(props: {
  grid: RouteHistoryRow[];
  historyDates: string[];
  weekdayLabel: string;
}) {
  const { grid, historyDates, weekdayLabel } = props;
  const [weekIndex, setWeekIndex] = useState(0);

  const weekGroups = useMemo(() => {
    const groups: string[][] = [];
    for (let index = 0; index < historyDates.length; index += 7) {
      groups.push(historyDates.slice(index, index + 7));
    }
    return groups;
  }, [historyDates]);

  const visibleDates = useMemo(
    () => weekGroups[weekIndex] ?? weekGroups[0] ?? [],
    [weekGroups, weekIndex]
  );

  const displayDates = useMemo(
    () => [...visibleDates].reverse(),
    [visibleDates]
  );

  const rangeLabel =
    displayDates.length > 0
      ? `${displayDates[0]} through ${displayDates[displayDates.length - 1]}`
      : "No dates";

  const routeInspection = useMemo(() => {
    const ranked = grid
      .map((row) => {
        const density = row.avgMiles > 0 ? row.avgStops / row.avgMiles : 0;
        return {
          label: row.label,
          avgStops: row.avgStops,
          avgPackages: row.avgPackages,
          avgMiles: row.avgMiles,
          density,
          runs: row.runs,
        };
      })
      .filter((row) => row.runs > 0);

    const highestStops = [...ranked].sort((a, b) => b.avgStops - a.avgStops)[0] ?? null;
    const longestMiles = [...ranked].sort((a, b) => b.avgMiles - a.avgMiles)[0] ?? null;
    const mostDense = [...ranked].sort((a, b) => b.density - a.density)[0] ?? null;

    return {
      highestStops,
      longestMiles,
      mostDense,
    };
  }, [grid]);

  return (
    <section style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
      <div className="route-history__header" style={{ padding: 12, borderBottom: "1px solid #e6edf5", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
Route History Evidence
          </p>
          <strong>Same-weekday route performance</strong>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12, fontWeight: 850 }}>
            Showing {weekIndex === 0 ? "most recent 7" : "prior 7"} matching weekdays · {rangeLabel}
          </p>
        </div>

        <div className="route-history__actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
            {grid.length} routes
          </span>
          <button
            type="button"
            className="button"
            disabled={weekGroups.length < 2}
            onClick={() => setWeekIndex((current) => (current === 0 ? 1 : 0))}
            style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
          >
            {weekIndex === 0 ? "Show prior 7" : "Show most recent 7"}
          </button>
        </div>
      </div>

      <section className="route-history__inspections" style={{ padding: 12, borderBottom: "1px solid #e6edf5", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <RouteInspectionCard
          label="Heaviest stop load"
          route={routeInspection.highestStops?.label}
          value={routeInspection.highestStops ? `${fmt(routeInspection.highestStops.avgStops, 1)} avg stops` : "—"}
          detail={routeInspection.highestStops ? `${fmt(routeInspection.highestStops.avgPackages, 1)} avg packages` : "No route history"}
        />
        <RouteInspectionCard
          label="Longest mileage"
          route={routeInspection.longestMiles?.label}
          value={routeInspection.longestMiles ? `${fmt(routeInspection.longestMiles.avgMiles, 1)} avg miles` : "—"}
          detail={routeInspection.longestMiles ? `${fmt(routeInspection.longestMiles.avgStops, 1)} avg stops` : "No route history"}
        />
        <RouteInspectionCard
          label="Highest stop density"
          route={routeInspection.mostDense?.label}
          value={routeInspection.mostDense ? `${fmt(routeInspection.mostDense.density, 2)} stops / mile` : "—"}
          detail={routeInspection.mostDense ? `${fmt(routeInspection.mostDense.avgMiles, 1)} avg miles` : "No route history"}
        />
      </section>

      <div className="route-history__table-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left" }}>
              <th style={{ ...th, minWidth: 178 }}>Route</th>
              <th style={rollupTh}>Runs</th>
              <th style={rollupTh}>Avg Stops</th>
              <th style={rollupTh}>Avg Pkgs</th>
              <th style={rollupTh}>Avg Miles</th>
              <th style={rollupTh}>Avg Duty</th>
              {displayDates.map((date) => (
                <th key={date} style={{ ...th, minWidth: 92 }}>
                  {shortDate(date)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {grid.map((row) => (
              <tr key={row.key} style={{ borderBottom: "1px solid #eef2f7" }}>
                <td style={{ padding: "8px 10px", fontWeight: 950 }}>{row.label}</td>
                <td style={rollupTdStrong}>{row.runs}/14</td>
                <td style={rollupTd}>{fmt(row.avgStops, 1)}</td>
                <td style={rollupTd}>{fmt(row.avgPackages, 1)}</td>
                <td style={rollupTd}>{fmt(row.avgMiles, 1)}</td>
                <td style={rollupTd}>{fmt(row.avgDuty, 1)}</td>
                {displayDates.map((date) => {
                  const cell = row.cells.find((item) => item.date === date);

                  return (
                    <td key={date} style={{ padding: "8px 10px", color: cell?.stops ? "#0f172a" : "#94a3b8" }}>
                      {cell?.stops ? (
                        <span>
                          <strong>{fmt(cell.stops)}</strong>
                          <span style={{ color: "#64748b" }}> / {fmt(cell.packages)}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {!grid.length ? (
              <tr>
                <td colSpan={13} style={{ padding: 14, color: "#64748b", fontWeight: 850 }}>
                  Loading baseline routes and same-weekday DSW history.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RouteInspectionCard(props: { label: string; route?: string | null; value: string; detail: string }) {
  return (
    <section style={{ border: "1px solid #edf2f7", borderRadius: 12, background: "#f8fafc", padding: 10, display: "grid", gap: 5 }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 10, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {props.label}
      </p>
      <strong style={{ color: "#0f172a", fontSize: 13 }}>{props.route ?? "No route"}</strong>
      <span style={{ color: "#334155", fontSize: 18, fontWeight: 950, lineHeight: 1 }}>
        {props.value}
      </span>
      <span style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>{props.detail}</span>
    </section>
  );
}

const th = {
  padding: "9px 10px",
  borderBottom: "1px solid #e6edf5",
} as const;

const rollupTh = {
  ...th,
  background: "#eef6ff",
  color: "#334155",
} as const;

const rollupTd = {
  padding: "8px 10px",
  background: "#f8fbff",
} as const;

const rollupTdStrong = {
  ...rollupTd,
  fontWeight: 900,
} as const;
