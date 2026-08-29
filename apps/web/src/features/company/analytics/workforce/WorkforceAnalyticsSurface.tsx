"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import styles from "./workforce-analytics.module.css";
import { buildWorkforcePlan, type WorkforcePlanScenario } from "./workforcePlanning";
import { activeRosterHeadcount } from "./workforceRoster";
import type { WorkforceTenureProfile } from "./workforceTenure";
import type { WorkforceResignationNotice } from "./resignationNotice";

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
  onboarding_candidates?: number;
  tenure?: WorkforceTenureProfile;
  notice_as_of?: string;
  notice_resignations?: WorkforceResignationNotice[];
  driver_utilization?: {
    full_time: number;
    part_time: number;
    unscheduled: number;
    avp: number;
    route_day_equivalents: number;
    full_time_day_threshold: number;
  };
  schedule_coverage?: {
    startDate: string;
    endDate: string;
    demandRouteDays: number;
    coveredRouteDays: number;
    openRouteDays: number;
    coveragePercent: number;
    seamCount: number;
  };
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

function scenarioDelta(scenario: WorkforcePlanScenario) {
  if (scenario.key === "peak" && scenario.targetLow != null && scenario.targetHigh != null) {
    if (scenario.projectedCurrent < scenario.targetLow) {
      return `${scenario.status === "critical" ? "Critical · " : ""}${scenario.targetLow - scenario.projectedCurrent} below sustained demand · ${scenario.targetHigh - scenario.projectedCurrent} below max-day readiness`;
    }
    if (scenario.projectedCurrent <= scenario.targetHigh) {
      return `Inside observed range · ${scenario.targetHigh - scenario.projectedCurrent} below max-day readiness`;
    }
  }
  if (scenario.delta < 0) return `${scenario.status === "critical" ? "Critical · " : ""}${Math.abs(scenario.delta)} drivers below target`;
  if (scenario.delta === 0) return "At target";
  return scenario.status === "heavy"
    ? `${scenario.delta} drivers above planning band`
    : `${scenario.delta} drivers of operating cover`;
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
      fetch(`/api/company/${slug}/people/reports/workforce-readiness?as_of=${encodeURIComponent(throughDate)}`, {
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
  const activeHeadcount = readiness?.driver_utilization?.full_time ?? activeRosterHeadcount(summary);
  const schedulePatterns = workforce?.schedule_patterns;
  const scheduleHistoryPartial = Boolean(
    workforce?.coverage.schedule_start && startDate && workforce.coverage.schedule_start > startDate
  );
  const attendanceSignals = (summary?.call_outs ?? 0) + (summary?.no_shows ?? 0) + (summary?.late_arrivals ?? 0);
  const noticeResignations = readiness?.notice_resignations ?? [];
  const routeReadyNoticeDepartures = noticeResignations.filter(
    (notice) => notice.route_ready_departure
  ).length;
  const projectedActiveDrivers = Math.max(
    0,
    activeHeadcount - routeReadyNoticeDepartures
  );
  const workforcePlan = useMemo(() => buildWorkforcePlan(
    payload?.rows ?? [],
    throughDate ?? "",
    activeHeadcount,
    workforce?.monthly ?? [],
    routeReadyNoticeDepartures
  ), [payload, throughDate, activeHeadcount, workforce?.monthly, routeReadyNoticeDepartures]);
  const tenure = readiness?.tenure;

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 36 }}>
        <article className={styles.report}>
          <header className={styles.hero}>
            <div>
              <p>Analytics · Workforce</p>
              <h1>Workforce Analytics</h1>
              <span>People supply, schedule capacity, attendance pressure, hiring flow, and retention across the selected operating range.</span>
            </div>
            <div className={styles.contractContext}>
              <span>Shared analytics context</span>
              <strong>Calendar year {loadedYear ?? "—"}</strong>
              <small>{startDate && contractEndDate ? `${formatDate(startDate)} – ${formatDate(contractEndDate)}` : "Loading calendar range…"}</small>
              <small>Current through {formatDate(throughDate)}</small>
            </div>
          </header>

          {(payloadLoading || loading) ? <div className={styles.state}>Building the contract workforce record…</div> : null}
          {(analyticsError || error) ? <div className={`${styles.state} ${styles.error}`}><strong>Workforce analytics unavailable.</strong><span>{analyticsError ?? error}</span></div> : null}

          {!payloadLoading && !loading && !analyticsError && !error && workforce ? (
            <>
              <section className={styles.summary}>
                <article className={noticeResignations.length ? styles.offRampCard : ""}>
                  <span>Full-time drivers</span>
                  <strong>{formatNumber(activeHeadcount)}</strong>
                  <small>
                    Derived at {formatNumber(readiness?.driver_utilization?.full_time_day_threshold ?? 5)} baseline days · {formatNumber(readiness?.driver_utilization?.part_time ?? 0)} PT
                    {noticeResignations.length ? ` · ${formatNumber(noticeResignations.length)} on notice` : ""}
                  </small>
                </article>
                <article className={(readiness?.schedule_coverage?.openRouteDays ?? 0) > 0 ? styles.signalCard : ""}>
                  <span>Scheduled route coverage</span>
                  <strong>{(readiness?.schedule_coverage?.demandRouteDays ?? 0) > 0
                    ? `${formatNumber(readiness?.schedule_coverage?.coveragePercent ?? 0)}%`
                    : "—"}</strong>
                  <small>{(readiness?.schedule_coverage?.demandRouteDays ?? 0) > 0
                    ? `${formatNumber(readiness?.schedule_coverage?.coveredRouteDays ?? 0)} of ${formatNumber(readiness?.schedule_coverage?.demandRouteDays ?? 0)} route-days · ${formatNumber(readiness?.schedule_coverage?.openRouteDays ?? 0)} open`
                    : "No scheduled route demand in this window"}</small>
                </article>
                <article><span>Candidate pipeline</span><strong>{formatNumber(readiness?.onboarding_candidates ?? 0)}</strong><small>Current candidates in Onboarding</small></article>
                <article><span>Range hires</span><strong>{formatNumber(summary?.contract_hires ?? 0)}</strong><small>Hire date inside the selected range</small></article>
                <article><span>Range separations</span><strong>{formatNumber(summary?.contract_separations ?? 0)}</strong><small>Separation date inside the selected range</small></article>
                <article className={attendanceSignals ? styles.signalCard : ""}><span>Attendance signals</span><strong>{formatNumber(attendanceSignals)}</strong><small>{formatNumber(summary?.call_outs ?? 0)} call-outs · {formatNumber(summary?.no_shows ?? 0)} no-shows · {formatNumber(summary?.late_arrivals ?? 0)} late</small></article>
              </section>

              {noticeResignations.length ? (
                <section className={styles.offRampSection}>
                  <header className={styles.sectionHead}>
                    <div>
                      <p>Known workforce off-ramp</p>
                      <h2>Notice resignation countdown</h2>
                      <span>Active notice records remain in today&apos;s workforce through each final scheduled day, while projected capacity reflects the known loss now.</span>
                    </div>
                    <div className={styles.offRampProjection}>
                      <span>Projected route-ready</span>
                      <strong>{formatNumber(projectedActiveDrivers)} after notice</strong>
                      <small>{formatNumber(routeReadyNoticeDepartures)} current driver departure{routeReadyNoticeDepartures === 1 ? "" : "s"}</small>
                    </div>
                  </header>
                  <div className={styles.offRampRows}>
                    {noticeResignations.map((notice) => (
                      <article key={notice.id}>
                        <div className={styles.countdown}>
                          <strong>{formatNumber(notice.days_until_last_day)}</strong>
                          <span>{notice.days_until_last_day === 1 ? "day" : "days"} to last day</span>
                        </div>
                        <div className={styles.offRampIdentity}>
                          <strong>{notice.full_name}</strong>
                          <span>{notice.worker_type ?? notice.employment_status ?? "Roster member"}</span>
                        </div>
                        <div className={styles.offRampDates}>
                          <span>Notice {formatDate(notice.notice_date)}</span>
                          <strong>Final scheduled day {formatDate(notice.last_scheduled_date)}</strong>
                          <small>Separation effective {formatDate(notice.separation_effective_date)}</small>
                        </div>
                        <b className={notice.route_ready_departure ? styles.routeReadyLoss : styles.developmentExit}>
                          {notice.route_ready_departure ? "Route-ready capacity loss" : "Development capacity exit"}
                        </b>
                      </article>
                    ))}
                  </div>
                  <footer>Baseline schedule remains in force through the final scheduled day and stops painting after that boundary.</footer>
                </section>
              ) : null}

              {workforcePlan.recentPlanningRoutesPerDay > 0 ? (
                <section className={styles.planningSection}>
                  <header className={styles.sectionHead}>
                    <div>
                      <p>Demand-based workforce guidance</p>
                      <h2>Roster depth planning</h2>
                      <span>Secondary planning context behind the primary scheduled route-coverage measure. Full-time and part-time status is derived from baseline days; trainees remain outside independent route capacity.</span>
                    </div>
                    <div className={styles.currentCapacity}>
                      <span>{routeReadyNoticeDepartures ? "Current → projected" : "Current route-ready"}</span>
                      <strong>{formatNumber(activeHeadcount)} full-time drivers</strong>
                      <small>{routeReadyNoticeDepartures ? `${formatNumber(projectedActiveDrivers)} after active notice` : `${formatNumber(summary?.trainees ?? 0)} trainee${summary?.trainees === 1 ? "" : "s"} developing`}</small>
                    </div>
                  </header>
                  <div className={styles.scenarioGrid}>
                    {workforcePlan.scenarios.map((scenario) => (
                      <article className={`${styles.scenarioCard} ${styles[scenario.status]}`} key={scenario.key}>
                        <div className={styles.scenarioTitle}>
                          <span>{scenario.eyebrow}</span>
                          <b>{scenario.status}</b>
                        </div>
                        <h3>{scenario.label}</h3>
                        <div className={styles.targetLine}>
                          <strong>{scenario.targetLow != null && scenario.targetHigh != null
                            ? `${formatNumber(scenario.targetLow)}–${formatNumber(scenario.targetHigh)}`
                            : formatNumber(scenario.target)}</strong>
                          <span>{scenario.key === "peak" ? "driver range" : "target drivers"}</span>
                          <i>vs {formatNumber(scenario.projectedCurrent)} {scenario.noticeDepartures ? "projected" : "current"}</i>
                        </div>
                        <p className={styles.delta}>{scenarioDelta(scenario)}</p>
                        <div className={styles.readinessMeter}>
                          <i><b style={{ width: `${Math.min(100, scenario.readinessPercent)}%` }} /></i>
                          <span>{formatNumber(scenario.readinessPercent, 0)}% of {scenario.key === "peak" ? "max-day target" : "target"} staffed</span>
                        </div>
                        <p>{scenario.explanation}</p>
                        <div className={styles.evidenceTarget}>
                          <span>Company evidence</span>
                          <strong>{scenario.evidenceTarget == null ? "Building history" : `${formatNumber(scenario.evidenceTarget)} drivers`}</strong>
                          <small>{workforcePlan.evidenceCoverageFactor == null ? "Schedule and absence record needed" : `${workforcePlan.evidenceCoverageFactor.toFixed(3)} observed factor`}</small>
                        </div>
                        <small>{scenario.planningRoutesLow != null && scenario.planningRoutesHigh != null
                          ? `${formatNumber(scenario.planningRoutesLow, 1)} average–${formatNumber(scenario.planningRoutesHigh, 1)} max routes/day`
                          : `${formatNumber(scenario.planningRoutesPerDay, 1)} routes/day`} · {scenario.operatingDays} service days · {scenario.driverDays} days/driver · {workforcePlan.coverageFactor.toFixed(3)} coverage</small>
                      </article>
                    ))}
                  </div>
                  <div className={styles.planningProof}>
                    <div>
                      <span>BAU demand</span>
                      <strong>{formatNumber(workforcePlan.recentPlanningRoutesPerDay, 1)} routes/day</strong>
                      <small>Average · last 5 complete weeks · {formatDate(workforcePlan.recentWindowStart)} – {formatDate(workforcePlan.recentWindowEnd)}</small>
                    </div>
                    <div>
                      <span>Sustained peak</span>
                      <strong>{formatNumber(workforcePlan.peakPlanningRoutesPerDay, 1)} avg · {formatNumber(workforcePlan.peakMaximumRoutesPerDay, 1)} max routes/day</strong>
                      <small>Range inside strongest 5-week block · {formatDate(workforcePlan.peakWindowStart)} – {formatDate(workforcePlan.peakWindowEnd)}</small>
                    </div>
                    <div>
                      <span>Coverage reserve</span>
                      <strong>{workforcePlan.coverageFactor.toFixed(3)} · 12.5%</strong>
                      <small>{workforcePlan.evidenceCoverageFactor != null ? `Company evidence: ${workforcePlan.evidenceCoverageFactor.toFixed(3)} factor from ${formatNumber((1 - workforcePlan.availability) * 100, 1)}% observed absence burden` : "Default until company history can calibrate the factor"}</small>
                    </div>
                  </div>
                  <p className={styles.formula}>
                    <strong>How the targets are calculated:</strong> required routes/day × service days ÷ driver days/week × coverage factor, rounded up. BAU uses its recent average; Peak shows the sustained average through the highest observed route day in its strongest five-week block and plans six driver-days across seven service days. The planning benchmark uses 1.125; company evidence uses its observed scheduled-assignment loss from PTO, call-outs, and no-shows. Readiness below 85% is critical, 85–99% is light, 100–110% is optimal, and above 110% is heavy.
                  </p>
                </section>
              ) : null}

              {tenure ? (
                <section className={styles.tenureSection}>
                  <header className={styles.sectionHead}>
                    <div>
                      <p>Experience + management readiness</p>
                      <h2>Tenure mix and supervision load</h2>
                      <span>Current Active drivers grouped by tenure as of {formatDate(tenure.as_of)}. Tenure directs coaching attention; it does not by itself assert a service or safety failure.</span>
                    </div>
                    <div className={styles.tenureHeadline}>
                      <span>New-driver cohort</span>
                      <strong>{formatNumber(tenure.new_driver_count)} · {formatNumber(tenure.new_driver_share * 100)}%</strong>
                      <small>First 90 days · {formatNumber(summary?.trainees ?? 0)} trainee{summary?.trainees === 1 ? "" : "s"} separate</small>
                    </div>
                  </header>
                  <div className={styles.tenureSegments}>
                    {tenure.segments.map((segment) => (
                      <article key={segment.key}>
                        <span>{segment.label}</span>
                        <strong>{formatNumber(segment.count)}</strong>
                        <small>{segment.range} · {formatNumber(segment.share * 100)}% of known</small>
                        <i><b style={{ width: `${segment.share * 100}%` }} /></i>
                        <em>{segment.managementFocus}</em>
                      </article>
                    ))}
                  </div>
                  <div className={styles.tenureGuidance}>
                    <div>
                      <span>Management focus</span>
                      <strong>{tenure.new_driver_share >= 0.3 ? "Elevated coaching load" : tenure.new_driver_share >= 0.15 ? "Active development load" : "Established workforce mix"}</strong>
                    </div>
                    <p>{tenure.new_driver_count > 0 ? `${formatNumber(tenure.new_driver_count)} active drivers are inside their first 90 days. Prioritize ride-alongs, pickup-service verification, safety observation, and frequent reliability feedback while their operating record matures.` : "No active drivers are currently inside the first 90-day development window."}</p>
                    <small>{tenure.missing_hire_date ? `${formatNumber(tenure.missing_hire_date)} Active driver${tenure.missing_hire_date === 1 ? " is" : "s are"} excluded because hire date is missing.` : `${formatNumber(tenure.known_tenure)} of ${formatNumber(tenure.active_drivers)} Active drivers have known hire dates.`}</small>
                  </div>
                </section>
              ) : null}

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
                  <span>Active workforce composition</span><strong>{formatNumber(activeHeadcount)} active</strong>
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
