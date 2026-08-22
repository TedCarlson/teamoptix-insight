"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "./AnalyticsDataProvider";
import CompositeOperatingChart from "./CompositeOperatingChart";
import AnalyticsComparisonBrief from "./AnalyticsComparisonBrief";
import DashboardHealthPanel from "./DashboardHealthPanel";
import { buildAnalyticsComparisonBrief } from "./analyticsComparison";
import {
  buildDashboardHealth,
  type DashboardExpressContext,
  type DashboardWorkforceContext,
} from "./dashboardHealth";
import { buildOperatingIntelligenceDataset } from "./operatingIntelligence";

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

export default function AnalyticsDashboardSurface({ slug }: { slug: string }) {
  const {
    payload,
    comparisonPayload,
    payloadLoading,
    comparisonLoading,
    error,
    comparisonError,
    comparisonMode,
  } = useAnalyticsData();
  const [contextState, setContextState] = useState<DashboardContextState | null>(null);

  const metadata = payload?.metadata ?? null;
  const intelligence = useMemo(
    () => buildOperatingIntelligenceDataset(payload?.rows ?? []),
    [payload]
  );
  const comparisonIntelligence = useMemo(
    () => buildOperatingIntelligenceDataset(comparisonPayload?.rows ?? []),
    [comparisonPayload]
  );
  const comparisonBrief = useMemo(
    () =>
      payload && comparisonPayload
        ? buildAnalyticsComparisonBrief(payload.rows, comparisonPayload.rows)
        : null,
    [comparisonPayload, payload]
  );
  const chartComparison = useMemo(
    () =>
      comparisonBrief?.coverage === "strong" && comparisonPayload
        ? {
            days: comparisonIntelligence.days,
            label: "Comparison period",
            weeks: comparisonIntelligence.weeks,
          }
        : undefined,
    [comparisonBrief, comparisonIntelligence, comparisonPayload]
  );
  const startDate = metadata?.start_date ?? null;
  const throughDate = metadata?.through_service_date ?? null;

  useEffect(() => {
    if (!startDate || !throughDate) return;
    let active = true;
    const contextKey = `${startDate}:${throughDate}`;

    fetch(
      `/api/company/${slug}/analytics/dashboard-context?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(throughDate)}`,
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
        setContextState({ key: contextKey, data: body, error: null });
      })
      .catch((caught) => {
        if (!active) return;
        setContextState({
          key: contextKey,
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
  }, [slug, startDate, throughDate]);

  const contextKey =
    startDate && throughDate ? `${startDate}:${throughDate}` : null;
  const dashboardContext = contextState?.key === contextKey ? contextState.data : null;
  const contextError = contextState?.key === contextKey ? contextState.error : null;

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
          {payloadLoading ? (
            <article className="app-card" style={{ padding: 24, minHeight: 260, display: "grid", placeItems: "center" }}>
              <span style={{ color: "#64748b", fontWeight: 800 }}>Building the selected calendar-range history…</span>
            </article>
          ) : null}

          {!payloadLoading && error ? (
            <article className="app-card" style={{ padding: 20 }}>
              <strong style={{ color: "#b91c1c" }}>Operating history unavailable.</strong>
              <span style={{ display: "block", marginTop: 5, color: "#64748b", fontSize: 12 }}>
                {error}
              </span>
            </article>
          ) : null}

          {!payloadLoading && payload && comparisonMode !== "none" ? (
            <AnalyticsComparisonBrief
              brief={comparisonBrief}
              comparisonMetadata={comparisonPayload?.metadata ?? null}
              error={comparisonError}
              loading={comparisonLoading}
              primaryMetadata={payload.metadata}
            />
          ) : null}

          {!payloadLoading && payload && intelligence.weeks.length > 0 ? (
            <>
              <CompositeOperatingChart
                comparison={chartComparison}
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
