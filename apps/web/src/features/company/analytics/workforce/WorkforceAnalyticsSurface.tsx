"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import styles from "./workforce-analytics.module.css";

type WorkforceSummary = {
  active: number;
  trainees: number;
  candidates: number;
  former: number;
  contract_hires: number;
  contract_separations: number;
  call_outs: number;
  no_shows: number;
  late_arrivals: number;
  pending_time_off: number;
};

type WorkforceMonth = {
  month: string;
  start_date: string;
  end_date: string;
  known_headcount: number;
  hires: number;
  separations: number;
  scheduled_assignments: number;
  scheduled_days: number;
  call_outs: number;
  no_shows: number;
  late_arrivals: number;
  approved_time_off_days: number;
};

type WorkforcePayload = {
  summary: WorkforceSummary;
  coverage: {
    schedule_start: string | null;
    schedule_end: string | null;
    dispatch_start: string | null;
    dispatch_end: string | null;
  };
  schedule_patterns: {
    four_or_less: number;
    five_day: number;
    six_plus: number;
    person_weeks: number;
  };
  worker_types: Array<{ label: string; count: number }>;
  monthly: WorkforceMonth[];
  error?: string;
};

type ReadinessPayload = {
  introduced?: number;
  checkpoints?: Array<{
    key: string;
    label: string;
    reached: number;
    observed: number;
    inferred: number;
    lifecycle_conversion: number;
    step_conversion: number;
  }>;
  error?: string;
};

type DemandMonth = {
  routes: number;
  operatingDays: number;
};

const integer = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00Z`));
}

export default function WorkforceAnalyticsSurface({ slug }: { slug: string }) {
  const { payload, payloadLoading, error: analyticsError, loadedYear } = useAnalyticsData();
  const [workforce, setWorkforce] = useState<WorkforcePayload | null>(null);
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [loadedRange, setLoadedRange] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);

  const startDate = payload?.metadata.start_date ?? null;
  const contractEndDate = payload?.metadata.end_date ?? null;
  const throughDate = payload?.metadata.through_service_date ?? null;
  const requestKey = startDate && throughDate ? `${startDate}:${throughDate}` : null;
  const loading = Boolean(requestKey && loadedRange !== requestKey);
  const error = loadError?.key === requestKey ? loadError.message : null;

  useEffect(() => {
    if (!startDate || !throughDate) return;
    let active = true;
    const rangeKey = `${startDate}:${throughDate}`;

    Promise.all([
      fetch(`/api/company/${slug}/analytics/workforce?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(throughDate)}`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/company/${slug}/people/reports/workforce-readiness`, {
        credentials: "include",
        cache: "no-store",
      }),
    ])
      .then(async ([workforceResponse, readinessResponse]) => {
        const workforceBody = (await workforceResponse.json()) as WorkforcePayload;
        const readinessBody = (await readinessResponse.json()) as ReadinessPayload;
        if (!workforceResponse.ok) throw new Error(workforceBody.error ?? "Unable to load workforce analytics.");
        if (!readinessResponse.ok) throw new Error(readinessBody.error ?? "Unable to load hiring readiness.");
        return [workforceBody, readinessBody] as const;
      })
      .then(([workforceBody, readinessBody]) => {
        if (!active) return;
        setWorkforce(workforceBody);
        setReadiness(readinessBody);
        setLoadError(null);
        setLoadedRange(rangeKey);
      })
      .catch((caught) => {
        if (!active) return;
        setWorkforce(null);
        setReadiness(null);
        setLoadError({
          key: rangeKey,
          message: caught instanceof Error ? caught.message : "Unable to load workforce analytics.",
        });
        setLoadedRange(rangeKey);
      });

    return () => {
      active = false;
    };
  }, [slug, startDate, throughDate]);

  const demandByMonth = useMemo(() => {
    const map = new Map<string, DemandMonth>();
    for (const row of payload?.rows ?? []) {
      const month = row.service_date.slice(0, 7);
      const current = map.get(month) ?? { routes: 0, operatingDays: 0 };
      current.routes += integer(row.route_count);
      current.operatingDays += 1;
      map.set(month, current);
    }
    return map;
  }, [payload]);

  const capacityRows = useMemo(() => (workforce?.monthly ?? []).map((month) => {
    const demand = demandByMonth.get(month.month) ?? { routes: 0, operatingDays: 0 };
    const averageRoutes = demand.operatingDays ? demand.routes / demand.operatingDays : 0;
    const averageScheduled = month.scheduled_days ? month.scheduled_assignments / month.scheduled_days : null;
    return {
      ...month,
      averageRoutes,
      averageScheduled,
      coverage: averageScheduled != null && averageRoutes > 0 ? averageScheduled / averageRoutes : null,
    };
  }), [demandByMonth, workforce]);

  const capacityMax = Math.max(
    ...capacityRows.flatMap((row) => [row.averageRoutes, row.averageScheduled ?? 0]),
    1
  );
  const summary = workforce?.summary;
  const schedulePatterns = workforce?.schedule_patterns;
  const scheduleHistoryPartial = Boolean(
    workforce?.coverage.schedule_start && startDate && workforce.coverage.schedule_start > startDate
  );
  const attendanceSignals = (summary?.call_outs ?? 0) + (summary?.no_shows ?? 0) + (summary?.late_arrivals ?? 0);

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 36 }}>
        <article className={styles.report}>
          <header className={styles.hero}>
            <div>
              <p>Analytics · Workforce</p>
              <h1>Workforce Analytics</h1>
              <span>People supply, schedule capacity, attendance pressure, hiring flow, and retention across the shared contract block.</span>
            </div>
            <div className={styles.contractContext}>
              <span>Shared contract context</span>
              <strong>Contract year {loadedYear ?? "—"}</strong>
              <small>{startDate && contractEndDate ? `${formatDate(startDate)} – ${formatDate(contractEndDate)}` : "Loading contract block…"}</small>
              <small>Current through {formatDate(throughDate)}</small>
            </div>
          </header>

          {(payloadLoading || loading) ? <div className={styles.state}>Building the contract workforce record…</div> : null}
          {(analyticsError || error) ? <div className={`${styles.state} ${styles.error}`}><strong>Workforce analytics unavailable.</strong><span>{analyticsError ?? error}</span></div> : null}

          {!payloadLoading && !loading && !analyticsError && !error && workforce ? (
            <>
              <section className={styles.summary}>
                <article><span>Active workforce</span><strong>{formatNumber((summary?.active ?? 0) + (summary?.trainees ?? 0))}</strong><small>{formatNumber(summary?.trainees ?? 0)} trainees included</small></article>
                <article><span>Candidate pipeline</span><strong>{formatNumber(summary?.candidates ?? 0)}</strong><small>{formatNumber(readiness?.introduced ?? 0)} lifecycle records observed</small></article>
                <article><span>Contract hires</span><strong>{formatNumber(summary?.contract_hires ?? 0)}</strong><small>Hire date inside shared contract block</small></article>
                <article><span>Contract separations</span><strong>{formatNumber(summary?.contract_separations ?? 0)}</strong><small>Separation date inside shared contract block</small></article>
                <article className={attendanceSignals ? styles.signalCard : ""}><span>Attendance signals</span><strong>{formatNumber(attendanceSignals)}</strong><small>{formatNumber(summary?.call_outs ?? 0)} call-outs · {formatNumber(summary?.no_shows ?? 0)} no-shows · {formatNumber(summary?.late_arrivals ?? 0)} late</small></article>
              </section>

              {scheduleHistoryPartial ? (
                <div className={styles.coverageNotice}>
                  <strong>Schedule history begins {formatDate(workforce.coverage.schedule_start)}.</strong>
                  <span>Earlier contract months retain route demand and roster movement, but schedule coverage is intentionally left blank.</span>
                </div>
              ) : null}

              <section className={styles.capacitySection}>
                <header className={styles.sectionHead}>
                  <div><p>Demand + people supply</p><h2>Deployed workforce capacity</h2><span>Average scheduled people per recorded schedule day compared with average routes operated per FINAL day.</span></div>
                  <div className={styles.coverageRange}><span>Schedule record</span><strong>{formatDate(workforce.coverage.schedule_start)} – {formatDate(workforce.coverage.schedule_end)}</strong></div>
                </header>
                <div className={styles.capacityLegend}><span><i className={styles.demandMark} />Average routes/day</span><span><i className={styles.supplyMark} />Scheduled people/day</span></div>
                <div className={styles.capacityRows}>
                  {capacityRows.map((row) => (
                    <div className={styles.capacityRow} key={row.month}>
                      <strong>{formatMonth(row.month)}</strong>
                      <div className={styles.bars}>
                        <span className={styles.demandBar} style={{ width: `${(row.averageRoutes / capacityMax) * 100}%` }} />
                        {row.averageScheduled != null ? <span className={styles.supplyBar} style={{ width: `${(row.averageScheduled / capacityMax) * 100}%` }} /> : null}
                      </div>
                      <span>{formatNumber(row.averageRoutes, 1)} routes</span>
                      <span>{row.averageScheduled == null ? "Schedule —" : `${formatNumber(row.averageScheduled, 1)} scheduled`}</span>
                      <b className={row.coverage != null && row.coverage < 1 ? styles.tight : ""}>{row.coverage == null ? "Not collected" : `${formatNumber(row.coverage * 100, 0)}% factor`}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.twoColumn}>
                <article className={styles.panel}>
                  <header className={styles.sectionHead}><div><p>Workforce movement</p><h2>Headcount, hires, and exits</h2><span>Chronological contract-month movement from company-owned roster dates.</span></div></header>
                  <div className={styles.movementHead}><span>Month</span><span>Known HC</span><span>Hires</span><span>Exits</span></div>
                  <div className={styles.movementRows}>
                    {capacityRows.map((row) => <div key={row.month}><strong>{formatMonth(row.month)}</strong><span>{formatNumber(row.known_headcount)}</span><b className={styles.hire}>+{formatNumber(row.hires)}</b><b className={styles.exit}>{row.separations ? `−${formatNumber(row.separations)}` : "0"}</b></div>)}
                  </div>
                </article>

                <article className={styles.panel}>
                  <header className={styles.sectionHead}><div><p>Hiring readiness</p><h2>Candidate conversion</h2><span>Observed and inferred progress through the governed hiring lifecycle.</span></div></header>
                  <div className={styles.funnel}>
                    {(readiness?.checkpoints ?? []).map((checkpoint) => (
                      <div key={checkpoint.key}>
                        <span><strong>{checkpoint.label}</strong><small>{formatNumber(checkpoint.reached)} reached · {checkpoint.lifecycle_conversion}% lifecycle</small></span>
                        <i><b style={{ width: `${checkpoint.lifecycle_conversion}%` }} /></i>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className={styles.threeColumn}>
                <article className={styles.miniPanel}>
                  <span>Schedule patterns</span><strong>{formatNumber(schedulePatterns?.person_weeks ?? 0)} person-weeks</strong>
                  <div><b>{formatNumber(schedulePatterns?.five_day ?? 0)}</b><small>Five-day</small></div>
                  <div><b>{formatNumber(schedulePatterns?.six_plus ?? 0)}</b><small>Six-plus</small></div>
                  <div><b>{formatNumber(schedulePatterns?.four_or_less ?? 0)}</b><small>Four or fewer</small></div>
                </article>
                <article className={styles.miniPanel}>
                  <span>Attendance record</span><strong>{formatNumber(attendanceSignals)} signals</strong>
                  <div><b>{formatNumber(summary?.call_outs ?? 0)}</b><small>Call-outs</small></div>
                  <div><b>{formatNumber(summary?.no_shows ?? 0)}</b><small>No-shows</small></div>
                  <div><b>{formatNumber(summary?.late_arrivals ?? 0)}</b><small>Late arrivals</small></div>
                </article>
                <article className={styles.miniPanel}>
                  <span>Workforce composition</span><strong>{formatNumber((summary?.active ?? 0) + (summary?.trainees ?? 0))} active</strong>
                  {(workforce.worker_types ?? []).slice(0, 3).map((type) => <div key={type.label}><b>{formatNumber(type.count)}</b><small>{type.label}</small></div>)}
                  <p>{formatNumber(summary?.pending_time_off ?? 0)} time-off requests await review.</p>
                </article>
              </section>
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}
