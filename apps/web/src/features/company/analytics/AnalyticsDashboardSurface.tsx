"use client";

import { useMemo } from "react";
import {
  analyticsNumber,
  summarizeOperationsHistory,
} from "./operationsHistory.helpers";
import { useAnalyticsData } from "./AnalyticsDataProvider";

function formatCount(value: unknown) {
  const parsed = analyticsNumber(value);

  return parsed === null
    ? "—"
    : parsed.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      });
}

function formatAverage(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}

function formatDelta(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function titleCase(value: string) {
  return value
    .split("_")
    .map(
      (part) =>
        part.slice(0, 1).toUpperCase() +
        part.slice(1).toLowerCase()
    )
    .join(" ");
}

function Stat(props: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="context-stat">
      <span className="context-stat__label">{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail ? (
        <span
          style={{
            display: "block",
            marginTop: 4,
            color: "#64748b",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {props.detail}
        </span>
      ) : null}
    </div>
  );
}

export default function AnalyticsDashboardSurface() {
  const {
    selectedYear,
    loadedYear,
    yearOptions,
    payload,
    yearsLoading,
    payloadLoading,
    error,
    selectYear,
    loadSelectedYear,
  } = useAnalyticsData();

  const summary = useMemo(
    () => summarizeOperationsHistory(payload?.rows ?? []),
    [payload]
  );

  const narrative =
    !payload
      ? "Select a year and load the governed operating history."
      : !summary.latest
        ? `No finalized DSW operating days are available for ${selectedYear ?? "the selected year"}.`
        : summary.previousOperatingDayCount === 0
          ? `${formatDate(summary.latest.service_date)} is available, but there are no prior finalized operating days in the loaded year for comparison.`
          : `On ${formatDate(summary.latest.service_date)}, route volume was ${formatDelta(summary.routeDeltaPercent)} versus the previous ${summary.previousOperatingDayCount} finalized operating days. Stops were ${formatDelta(summary.stopDeltaPercent)} and packages were ${formatDelta(summary.packageDeltaPercent)}.`;

  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 24 }}
      >
        <section style={{ display: "grid", gap: 10 }}>
          <article className="app-card" style={{ padding: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p className="value-card__eyebrow">
                  Analytics · Dashboard
                </p>
                <h2 className="app-card__title">
                  Operating Intelligence
                </h2>
                <p
                  className="app-card__body"
                  style={{ marginTop: 8 }}
                >
                  Load one operating year. Dashboard calculations
                  then run locally against that canonical payload.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 6,
                  justifyItems: "end",
                }}
              >
                <span
                  style={{
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Operating year
                </span>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    role="group"
                    aria-label="Select operating year"
                    style={{
                      display: "inline-flex",
                      gap: 4,
                      padding: 4,
                      border: "1px solid #d6dfeb",
                      borderRadius: 999,
                      background: "#f8fafc",
                    }}
                  >
                    {yearsLoading ? (
                      <span
                        style={{
                          minWidth: 120,
                          padding: "8px 12px",
                          color: "#64748b",
                          fontSize: 12,
                          fontWeight: 800,
                          textAlign: "center",
                        }}
                      >
                        Loading years…
                      </span>
                    ) : yearOptions.length === 0 ? (
                      <span
                        style={{
                          minWidth: 150,
                          padding: "8px 12px",
                          color: "#64748b",
                          fontSize: 12,
                          fontWeight: 800,
                          textAlign: "center",
                        }}
                      >
                        No finalized history
                      </span>
                    ) : yearOptions.map((option) => {
                      const selected = option === selectedYear;
                      const loaded = option === loadedYear;

                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={payloadLoading}
                          aria-pressed={selected}
                          onClick={() => selectYear(option)}
                          style={{
                            minWidth: 58,
                            height: 34,
                            padding: "0 12px",
                            border: selected
                              ? "1px solid #2563eb"
                              : "1px solid transparent",
                            borderRadius: 999,
                            background: selected ? "#ffffff" : "transparent",
                            color: selected ? "#1d4ed8" : "#475569",
                            boxShadow: selected
                              ? "0 1px 4px rgba(15, 23, 42, 0.10)"
                              : "none",
                            cursor: payloadLoading ? "default" : "pointer",
                            fontSize: 13,
                            fontWeight: 900,
                          }}
                        >
                          {option}
                          {loaded ? (
                            <span
                              aria-label="Loaded"
                              title="Loaded analytics year"
                              style={{
                                marginLeft: 5,
                                color: "#16a34a",
                              }}
                            >
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={
                      payloadLoading ||
                      yearsLoading ||
                      selectedYear === null ||
                      yearOptions.length === 0 ||
                      !yearOptions.includes(selectedYear) ||
                      selectedYear === loadedYear
                    }
                    onClick={() => void loadSelectedYear()}
                  >
                    {payloadLoading
                      ? "Loading…"
                      : selectedYear === loadedYear &&
                          selectedYear !== null
                        ? `${selectedYear} Loaded`
                        : selectedYear !== null
                          ? `Load ${selectedYear}`
                          : "Load Analytics"}
                  </button>
                </div>
              </div>
            </div>

            {error ? (
              <p
                className="app-card__body"
                style={{ marginTop: 12, color: "#b91c1c" }}
              >
                {error}
              </p>
            ) : null}
          </article>

          <article className="app-card" style={{ padding: 16 }}>
            <p className="value-card__eyebrow">
              Decision support
            </p>
            <h3
              className="app-card__title"
              style={{ fontSize: 18 }}
            >
              Company signal
            </h3>

            <p
              className="app-card__body"
              style={{ marginTop: 10 }}
            >
              {narrative}
            </p>
          </article>

          {payload ? (
            <>
              <article className="app-card" style={{ padding: 16 }}>
                <p className="value-card__eyebrow">
                  Latest finalized operating day
                </p>
                <h3
                  className="app-card__title"
                  style={{ fontSize: 18 }}
                >
                  {formatDate(summary.latest?.service_date)}
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <Stat
                    label="Routes"
                    value={formatCount(
                      summary.latest?.route_count
                    )}
                    detail={formatDelta(
                      summary.routeDeltaPercent
                    )}
                  />
                  <Stat
                    label="Delivery stops"
                    value={formatCount(
                      summary.latest?.actual_delivery_stops
                    )}
                    detail={formatDelta(
                      summary.stopDeltaPercent
                    )}
                  />
                  <Stat
                    label="Delivery packages"
                    value={formatCount(
                      summary.latest?.actual_delivery_packages
                    )}
                    detail={formatDelta(
                      summary.packageDeltaPercent
                    )}
                  />
                  <Stat
                    label="Demand signal"
                    value={titleCase(summary.demandSignal)}
                    detail={`Previous ${summary.previousOperatingDayCount} finalized operating days`}
                  />
                </div>
              </article>

              <article className="app-card" style={{ padding: 16 }}>
                <p className="value-card__eyebrow">
                  Operating KPIs
                </p>
                <h3
                  className="app-card__title"
                  style={{ fontSize: 18 }}
                >
                  Loaded-year baseline
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <Stat
                    label="Avg weekday routes"
                    value={formatAverage(
                      summary.averageWeekdayRoutes
                    )}
                  />
                  <Stat
                    label="Avg weekend routes"
                    value={formatAverage(
                      summary.averageWeekendRoutes
                    )}
                  />
                  <Stat
                    label="Operating days"
                    value={String(
                      payload.metadata
                        .finalized_operating_day_count
                    )}
                  />
                  <Stat
                    label="Through service date"
                    value={formatDate(
                      payload.metadata.through_service_date
                    )}
                  />
                  <Stat
                    label="Terminal"
                    value={
                      summary.latest?.terminal_identity ?? "—"
                    }
                  />
                  <Stat
                    label="Contract"
                    value={summary.latest?.contract_label ?? "—"}
                  />
                </div>
              </article>

              <article className="app-card" style={{ padding: 16 }}>
                <p className="value-card__eyebrow">
                  Recent baseline
                </p>
                <h3
                  className="app-card__title"
                  style={{ fontSize: 18 }}
                >
                  Previous finalized operating days
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <Stat
                    label="Average routes"
                    value={formatAverage(
                      summary.previousAverageRoutes
                    )}
                  />
                  <Stat
                    label="Average stops"
                    value={formatAverage(
                      summary.previousAverageStops
                    )}
                  />
                  <Stat
                    label="Average packages"
                    value={formatAverage(
                      summary.previousAveragePackages
                    )}
                  />
                  <Stat
                    label="Comparison basis"
                    value={`${summary.previousOperatingDayCount} days`}
                    detail="Previous finalized operating days"
                  />
                </div>
              </article>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
