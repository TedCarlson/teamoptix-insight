"use client";

import { useMemo } from "react";
import { useAnalyticsData } from "./AnalyticsDataProvider";
import {
  WeeklyPackageVolume,
  WeeklyRouteTrend,
  WeeklyStopVolume,
} from "./OperatingIntelligenceCharts";
import { OperatingCalendar } from "./OperatingCalendar";
import { buildOperatingIntelligenceDataset } from "./operatingIntelligence";

type PayloadMetadata = {
  start_date?: string | null;
  end_date?: string | null;
  through_service_date?: string | null;
  finalized_operating_day_count?: number | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
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
  } = useAnalyticsData();

  const metadata = (payload?.metadata ?? null) as PayloadMetadata | null;
  const intelligence = useMemo(
    () => buildOperatingIntelligenceDataset(payload?.rows ?? []),
    [payload]
  );

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 28 }}>
        <section style={{ display: "grid", gap: 12 }}>
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
              <div style={{ maxWidth: 720 }}>
                <p className="value-card__eyebrow">Operating Intelligence</p>
                <h2 className="app-card__title">Contract-year operating story</h2>
                <p className="app-card__body" style={{ marginTop: 8 }}>
                  Weekly routes, completed stop and package volume, and operating modes rendered from the canonical FINAL DSW history payload.
                </p>
              </div>

              <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <span
                  style={{
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Contract year
                </span>
                <div
                  role="group"
                  aria-label="Select contract year"
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
                    <span style={{ padding: "8px 12px", color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                      Loading contracts…
                    </span>
                  ) : yearOptions.length === 0 ? (
                    <span style={{ padding: "8px 12px", color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                      No contract history
                    </span>
                  ) : (
                    yearOptions.map((option) => {
                      const selected = option === selectedYear;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={payloadLoading}
                          aria-pressed={selected}
                          onClick={() => selectYear(option)}
                          style={{
                            minWidth: 62,
                            height: 34,
                            padding: "0 12px",
                            border: selected ? "1px solid #2563eb" : "1px solid transparent",
                            borderRadius: 999,
                            background: selected ? "#ffffff" : "transparent",
                            color: selected ? "#1d4ed8" : "#475569",
                            boxShadow: selected ? "0 1px 4px rgba(15, 23, 42, 0.10)" : "none",
                            cursor: payloadLoading ? "default" : "pointer",
                            fontSize: 13,
                            fontWeight: 900,
                          }}
                        >
                          {option}
                          {option === loadedYear ? <span style={{ marginLeft: 5, color: "#16a34a" }}>✓</span> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 14,
                color: error ? "#b91c1c" : "#64748b",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {payloadLoading ? (
                <span>Loading FINAL operating history…</span>
              ) : error ? (
                <span>{error}</span>
              ) : payload && metadata ? (
                <>
                  <span>{formatDate(metadata.start_date)} – {formatDate(metadata.end_date)}</span>
                  <span>·</span>
                  <span>{metadata.finalized_operating_day_count ?? payload.rows.length} operating days</span>
                  <span>·</span>
                  <span>Current through {formatDate(metadata.through_service_date)}</span>
                </>
              ) : (
                <span>Select a contract year to load its operating history.</span>
              )}
            </div>
          </article>

          {payloadLoading ? (
            <article className="app-card" style={{ padding: 24, minHeight: 260, display: "grid", placeItems: "center" }}>
              <span style={{ color: "#64748b", fontWeight: 800 }}>Building the contract-year visual history…</span>
            </article>
          ) : null}

          {!payloadLoading && payload && intelligence.weeks.length > 0 ? (
            <>
              <WeeklyRouteTrend weeks={intelligence.weeks} overlays={intelligence.overlays} />
              <WeeklyStopVolume weeks={intelligence.weeks} overlays={intelligence.overlays} />
              <WeeklyPackageVolume weeks={intelligence.weeks} overlays={intelligence.overlays} />
              <OperatingCalendar
                days={intelligence.days}
                overlays={intelligence.overlays}
                startDate={metadata?.start_date ?? intelligence.days[0]?.serviceDate ?? ""}
                endDate={metadata?.end_date ?? intelligence.days.at(-1)?.serviceDate ?? ""}
                throughDate={metadata?.through_service_date}
              />
            </>
          ) : null}

          {!payloadLoading && payload && intelligence.weeks.length === 0 ? (
            <article className="app-card" style={{ padding: 24 }}>
              <h3 className="app-card__title" style={{ fontSize: 18 }}>No FINAL operating history</h3>
              <p className="app-card__body" style={{ marginTop: 8 }}>
                The selected contract period returned no operating-day rows to visualize.
              </p>
            </article>
          ) : null}
        </section>
      </section>
    </main>
  );
}
