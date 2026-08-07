"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "./AnalyticsDataProvider";
import CompositeOperatingChart from "./CompositeOperatingChart";
import DashboardHealthPanel from "./DashboardHealthPanel";
import {
  buildDashboardHealth,
  type DashboardExpressContext,
  type DashboardWorkforceContext,
} from "./dashboardHealth";
import { buildOperatingIntelligenceDataset } from "./operatingIntelligence";

type PayloadMetadata = {
  start_date?: string | null;
  end_date?: string | null;
  through_service_date?: string | null;
  finalized_operating_day_count?: number | null;
};

type DashboardContextPayload = {
  workforce: DashboardWorkforceContext;
  express: DashboardExpressContext;
  error?: string;
};

type DashboardContextState = {
  key: string;
  data: DashboardContextPayload | null;
  error: string | null;
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

export default function AnalyticsDashboardSurface({ slug }: { slug: string }) {
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
  const [contextState, setContextState] = useState<DashboardContextState | null>(null);

  const metadata = (payload?.metadata ?? null) as PayloadMetadata | null;
  const intelligence = useMemo(
    () => buildOperatingIntelligenceDataset(payload?.rows ?? []),
    [payload]
  );
  const throughDate = metadata?.through_service_date ?? null;

  useEffect(() => {
    if (!throughDate) return;
    let active = true;

    fetch(
      `/api/company/${slug}/analytics/dashboard-context?end=${encodeURIComponent(throughDate)}`,
      {
        credentials: "include",
        cache: "no-store",
      }
    )
      .then(async (response) => {
        const body = (await response.json()) as DashboardContextPayload;
        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load dashboard operating context.");
        }
        return body;
      })
      .then((body) => {
        if (!active) return;
        setContextState({ key: throughDate, data: body, error: null });
      })
      .catch((caught) => {
        if (!active) return;
        setContextState({
          key: throughDate,
          data: null,
          error:
            caught instanceof Error
              ? caught.message
              : "Unable to load dashboard operating context.",
        });
      });

    return () => {
      active = false;
    };
  }, [slug, throughDate]);

  const dashboardContext = contextState?.key === throughDate ? contextState.data : null;
  const contextError = contextState?.key === throughDate ? contextState.error : null;

  const health = useMemo(() => {
    if (!payload || !throughDate || !dashboardContext) return null;
    return buildDashboardHealth(
      payload.rows,
      throughDate,
      dashboardContext.workforce,
      dashboardContext.express
    );
  }, [dashboardContext, payload, throughDate]);

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
              <CompositeOperatingChart
                days={intelligence.days}
                weeks={intelligence.weeks}
                overlays={intelligence.overlays}
                compact
              />
              {health ? (
                <DashboardHealthPanel
                  health={health}
                  express={dashboardContext?.express ?? null}
                  slug={slug}
                />
              ) : contextError ? (
                <article className="app-card" style={{ padding: 18 }}>
                  <strong style={{ color: "#b91c1c" }}>Operating health unavailable.</strong>
                  <span style={{ display: "block", marginTop: 5, color: "#64748b", fontSize: 12 }}>
                    {contextError}
                  </span>
                </article>
              ) : (
                <article className="app-card" style={{ padding: 18 }}>
                  <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                    Connecting demand, workforce, and service health…
                  </span>
                </article>
              )}
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
