"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import {
  buildWorkforcePlan,
  calculateWorkforceTarget,
  DEFAULT_COVERAGE_FACTOR,
  type WorkforcePlanningMonth,
} from "../workforce/workforcePlanning";
import { PEAK_HISTORICAL_CONTEXT } from "./peakHistoricalContext";
import styles from "./peak-planning.module.css";

type WorkforcePayload = {
  summary?: { active?: number; trainees?: number };
  monthly?: WorkforcePlanningMonth[];
  error?: string;
};

type ReadinessPayload = {
  notice_resignations?: Array<{ route_ready_departure?: boolean }>;
  error?: string;
};

type Assumptions = {
  routesPerDay: number;
  serviceDays: number;
  driverDays: number;
  reservePercent: number;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function bounded(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function filenameCompanyName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("-");
}

function localDateStamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function peakPlanningFilename(slug: string, date = new Date()) {
  return `Peak-Planning_${filenameCompanyName(slug)}_${localDateStamp(date)}`;
}

export default function PeakPlanningSurface({ slug }: { slug: string }) {
  const { payload, payloadLoading, error: analyticsError, loadedYear } = useAnalyticsData();
  const [workforce, setWorkforce] = useState<WorkforcePayload | null>(null);
  const [noticeDepartures, setNoticeDepartures] = useState(0);
  const [contextError, setContextError] = useState<string | null>(null);
  const [loadedRange, setLoadedRange] = useState<string | null>(null);
  const [scenarioState, setScenarioState] = useState<{ evidenceKey: string; values: Assumptions } | null>(null);
  const [draft, setDraft] = useState<Assumptions | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const startDate = payload?.metadata.start_date ?? null;
  const endDate = payload?.metadata.end_date ?? null;
  const throughDate = payload?.metadata.through_service_date ?? null;
  const requestKey = startDate && throughDate ? `${startDate}:${throughDate}` : null;

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
        if (!workforceResponse.ok) throw new Error(workforceBody.error ?? "Unable to load workforce context.");
        if (!readinessResponse.ok) throw new Error(readinessBody.error ?? "Unable to load notice context.");
        return [workforceBody, readinessBody] as const;
      })
      .then(([workforceBody, readinessBody]) => {
        if (!active) return;
        setWorkforce(workforceBody);
        setNoticeDepartures((readinessBody.notice_resignations ?? []).filter((notice) => notice.route_ready_departure).length);
        setContextError(null);
        setLoadedRange(rangeKey);
      })
      .catch((caught) => {
        if (!active) return;
        setWorkforce(null);
        setNoticeDepartures(0);
        setContextError(caught instanceof Error ? caught.message : "Unable to load workforce context.");
        setLoadedRange(rangeKey);
      });

    return () => {
      active = false;
    };
  }, [slug, startDate, throughDate]);

  const activeDrivers = number(workforce?.summary?.active);
  const projectedDrivers = Math.max(0, activeDrivers - noticeDepartures);
  const evidence = useMemo(() => buildWorkforcePlan(
    payload?.rows ?? [],
    throughDate ?? "",
    activeDrivers,
    workforce?.monthly ?? [],
    noticeDepartures
  ), [payload, throughDate, activeDrivers, workforce?.monthly, noticeDepartures]);

  const evidenceKey = `${evidence.peakWindowStart}:${evidence.peakWindowEnd}:${evidence.peakMaximumRoutesPerDay}`;
  const evidenceDefaults = {
    routesPerDay: evidence.peakMaximumRoutesPerDay,
    serviceDays: 7,
    driverDays: 6,
    reservePercent: (DEFAULT_COVERAGE_FACTOR - 1) * 100,
  };
  const selected = scenarioState?.evidenceKey === evidenceKey
    ? scenarioState.values
    : evidenceDefaults;
  const coverageFactor = 1 + selected.reservePercent / 100;
  const sustainedTarget = calculateWorkforceTarget(
    evidence.peakPlanningRoutesPerDay,
    selected.serviceDays,
    selected.driverDays,
    coverageFactor
  );
  const observedMaxTarget = calculateWorkforceTarget(
    evidence.peakMaximumRoutesPerDay,
    selected.serviceDays,
    selected.driverDays,
    coverageFactor
  );
  const selectedTarget = calculateWorkforceTarget(
    selected.routesPerDay,
    selected.serviceDays,
    selected.driverDays,
    coverageFactor
  );
  const driverGap = projectedDrivers - selectedTarget;
  const routeDayDemand = selected.routesPerDay * selected.serviceDays;
  const rawCoverage = selected.driverDays > 0 ? routeDayDemand / selected.driverDays : 0;
  const demandGrowthPercent = evidence.recentPlanningRoutesPerDay > 0
    ? ((selected.routesPerDay / evidence.recentPlanningRoutesPerDay) - 1) * 100
    : 0;
  const loadingContext = Boolean(requestKey && loadedRange !== requestKey);
  const loading = payloadLoading || loadingContext;
  const error = analyticsError ?? contextError;

  function openEditor() {
    setDraft(selected);
    setShowEditor(true);
  }

  function applyDraft() {
    if (!draft) return;
    setScenarioState({
      evidenceKey,
      values: {
        routesPerDay: bounded(draft.routesPerDay, 1, 250),
        serviceDays: bounded(Math.round(draft.serviceDays), 1, 7),
        driverDays: bounded(Math.round(draft.driverDays), 1, 7),
        reservePercent: bounded(draft.reservePercent, 0, 100),
      },
    });
    setShowEditor(false);
  }

  function resetToEvidence() {
    setScenarioState({
      evidenceKey,
      values: evidenceDefaults,
    });
  }

  function exportPlan() {
    const previousTitle = document.title;
    document.title = peakPlanningFilename(slug);
    window.addEventListener("afterprint", () => {
      document.title = previousTitle;
    }, { once: true });
    window.print();
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 36 }}>
        <article className={styles.report}>
          <header className={styles.hero}>
            <div>
              <p>Analytics · Workforce planning</p>
              <h1>Peak Planning</h1>
              <span>Translate observed seasonal route pressure into a practical staffing range, then test a session-specific operating plan.</span>
            </div>
            <div className={styles.contractContext}>
              <span>Shared contract context</span>
              <strong>Contract year {loadedYear ?? "—"}</strong>
              <small>{startDate && endDate ? `${formatDate(startDate)} – ${formatDate(endDate)}` : "Loading contract block…"}</small>
              <small>Current through {formatDate(throughDate)}</small>
            </div>
          </header>

          {loading ? <div className={styles.state}>Building Peak evidence and workforce context…</div> : null}
          {error ? <div className={`${styles.state} ${styles.error}`}><strong>Peak Planning unavailable.</strong><span>{error}</span></div> : null}

          {!loading && !error && workforce && evidence.peakMaximumRoutesPerDay > 0 ? (
            <>
              <section className={styles.actions}>
                <div>
                  <span>Observed Peak evidence</span>
                  <strong>{formatNumber(evidence.peakPlanningRoutesPerDay, 1)} average–{formatNumber(evidence.peakMaximumRoutesPerDay, 0)} max routes/day</strong>
                  <small>{formatDate(evidence.peakWindowStart)} – {formatDate(evidence.peakWindowEnd)} · strongest complete five-week block</small>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={resetToEvidence}>Reset to evidence</button>
                <button type="button" className={styles.primaryButton} onClick={openEditor}>Adjust assumptions</button>
                <button type="button" className={styles.printButton} onClick={exportPlan}>Export plan</button>
              </section>

              <section className={styles.planGrid}>
                <article className={styles.rangeCard}>
                  <p>Observed demand range</p>
                  <h2>{formatNumber(evidence.peakPlanningRoutesPerDay, 1)}–{formatNumber(evidence.peakMaximumRoutesPerDay, 0)}</h2>
                  <strong>routes per day</strong>
                  <div className={styles.rangeTrack}><i /><b /></div>
                  <footer>
                    <span>Sustained trough<strong>{formatNumber(evidence.peakPlanningRoutesPerDay, 1)}</strong></span>
                    <span>Observed maximum<strong>{formatNumber(evidence.peakMaximumRoutesPerDay, 0)}</strong></span>
                  </footer>
                </article>

                <article className={styles.decisionCard}>
                  <p>Selected planning point</p>
                  <h2>{formatNumber(selected.routesPerDay, 1)} routes/day</h2>
                  <strong>{demandGrowthPercent >= 0 ? "+" : ""}{formatNumber(demandGrowthPercent, 1)}% vs current BAU</strong>
                  <div className={styles.driverTarget}>
                    <strong>{formatNumber(selectedTarget)}</strong>
                    <span>target drivers</span>
                  </div>
                  <b className={driverGap < 0 ? styles.shortfall : styles.ready}>
                    {driverGap < 0 ? `${Math.abs(driverGap)} drivers below plan` : `${driverGap} drivers of cover`}
                  </b>
                </article>

                <article className={styles.capacityCard}>
                  <p>Current → projected capacity</p>
                  <h2>{formatNumber(activeDrivers)} → {formatNumber(projectedDrivers)}</h2>
                  <strong>route-ready drivers</strong>
                  <dl>
                    <div><dt>Known notice departures</dt><dd>{formatNumber(noticeDepartures)}</dd></div>
                    <div><dt>Peak driver range</dt><dd>{formatNumber(sustainedTarget)}–{formatNumber(observedMaxTarget)}</dd></div>
                  </dl>
                </article>
              </section>

              <section className={styles.assumptionStrip}>
                <div><span>Route demand</span><strong>{formatNumber(selected.routesPerDay, 1)} / day</strong></div>
                <div><span>Demand change</span><strong>{demandGrowthPercent >= 0 ? "+" : ""}{formatNumber(demandGrowthPercent, 1)}% vs BAU</strong></div>
                <div><span>Operating week</span><strong>{formatNumber(selected.serviceDays)} service days</strong></div>
                <div><span>Driver schedule</span><strong>{formatNumber(selected.driverDays)} days / driver</strong></div>
                <div><span>Coverage reserve</span><strong>{formatNumber(selected.reservePercent, 1)}%</strong></div>
              </section>

              <section className={styles.mathSection}>
                <div>
                  <p>Planning math</p>
                  <h2>{formatNumber(routeDayDemand, 1)} route-days/week</h2>
                  <span>÷ {formatNumber(selected.driverDays)} driver-days = {formatNumber(rawCoverage, 1)} base drivers</span>
                  <strong>× {coverageFactor.toFixed(3)} coverage = {formatNumber(selectedTarget)} target drivers</strong>
                </div>
                <div>
                  <p>Decision frame</p>
                  <h2>{formatNumber(sustainedTarget)}–{formatNumber(observedMaxTarget)} drivers</h2>
                  <span>The low end protects the sustained Peak average. The high end is the maximum observed route-day plan.</span>
                  <strong>Use the selected point for the operating commitment; retain the range for risk visibility.</strong>
                </div>
              </section>

              <p className={styles.disclaimer}>This is a planning scenario, not a saved company configuration. Adjustments remain in this browser session and the report can be printed or saved as PDF.</p>

              <section className={styles.historicalContextPage} aria-labelledby="fedex-historical-context">
                <header className={styles.contextHero}>
                  <div>
                    <p>Insight Analytics · External planning context</p>
                    <h2 id="fedex-historical-context">FedEx historical Peak context</h2>
                    <span>Ten years of FedEx-reported holiday demand patterns establish a credible planning range and an outer stress boundary.</span>
                  </div>
                  <div className={styles.modelStamp}>
                    <span>Annual reference model</span>
                    <strong>{PEAK_HISTORICAL_CONTEXT.reportingWindow}</strong>
                    <small>Version {PEAK_HISTORICAL_CONTEXT.version} · Reviewed {PEAK_HISTORICAL_CONTEXT.reviewed}</small>
                  </div>
                </header>

                <div className={styles.contextPrinciple}>
                  <div>
                    <span>The planning distinction</span>
                    <strong>Package pressure does not translate one-for-one into route pressure.</strong>
                  </div>
                  <p>Density lets routes absorb some package growth. Stops, vehicle cube, duty time, and dispatch limits determine when additional routes and drivers are required.</p>
                </div>

                <div className={styles.demandBandGrid}>
                  {PEAK_HISTORICAL_CONTEXT.demandBands.map((band) => (
                    <article key={band.label} className={styles[`band_${band.tone}`]}>
                      <span>{band.label}</span>
                      <strong>{band.multiplier}</strong>
                      <small>of normal package demand</small>
                      <p>{band.note}</p>
                    </article>
                  ))}
                </div>

                <div className={styles.translationGrid}>
                  <section>
                    <div className={styles.sectionTitle}>
                      <span>How Insight converts context into a plan</span>
                      <strong>Industry signal to company commitment</strong>
                    </div>
                    <div className={styles.translationFlow}>
                      <div><b>1</b><span>FedEx history</span><small>Sets credible demand bands</small></div>
                      <i aria-hidden="true">→</i>
                      <div><b>2</b><span>Contract evidence</span><small>Tests actual stops, packages, and routes</small></div>
                      <i aria-hidden="true">→</i>
                      <div><b>3</b><span>Operating limits</span><small>Applies days, schedules, and reserve</small></div>
                      <i aria-hidden="true">→</i>
                      <div><b>4</b><span>Staffing decision</span><small>Produces a practical range</small></div>
                    </div>
                  </section>

                  <aside>
                    <span>Scenario interpretation</span>
                    <dl>
                      <div><dt>Planning case</dt><dd>Use sustained demand to build the roster and schedule.</dd></div>
                      <div><dt>Heavy case</dt><dd>Test route splits, vehicles, and sixth-day availability.</dd></div>
                      <div><dt>Extreme day</dt><dd>Test contingency capacity - not permanent headcount.</dd></div>
                    </dl>
                  </aside>
                </div>

                <div className={styles.contextCallout}>
                  <div>
                    <span>Applied to this contract</span>
                    <strong>{formatNumber(evidence.peakPlanningRoutesPerDay, 1)} sustained to {formatNumber(evidence.peakMaximumRoutesPerDay, 0)} maximum routes/day</strong>
                    <small>Company recommendations remain grounded in the shared DSW history and the session assumptions on page one.</small>
                  </div>
                  <div>
                    <span>Current scenario</span>
                    <strong>{formatNumber(selectedTarget)} target drivers</strong>
                    <small>{formatNumber(selected.routesPerDay, 1)} routes/day · {formatNumber(selected.serviceDays)} service days · {formatNumber(selected.driverDays)} driver days · {formatNumber(selected.reservePercent, 1)}% reserve</small>
                  </div>
                </div>

                <footer className={styles.contextFooter}>
                  <p><strong>Use:</strong> FedEx history establishes external context; it does not override contract evidence or create a one-for-one package-to-route assumption.</p>
                  <p><strong>Annual maintenance:</strong> Refresh after each completed holiday reporting cycle and retain the reporting window, source set, review date, and model version.</p>
                  <small>Reference set: {PEAK_HISTORICAL_CONTEXT.sources.join("; ")}.</small>
                </footer>
              </section>
            </>
          ) : null}
        </article>
      </section>

      {showEditor && draft ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setShowEditor(false)}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="peak-plan-editor" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><p>Session scenario</p><h2 id="peak-plan-editor">Adjust Peak assumptions</h2></div>
              <button type="button" onClick={() => setShowEditor(false)} aria-label="Close Peak assumptions">×</button>
            </header>
            <div className={styles.formGrid}>
              <label>
                <span>Demand change above current BAU</span>
                <div className={styles.percentInput}><input type="number" min="-95" max="500" step="0.5" value={evidence.recentPlanningRoutesPerDay > 0 ? Number((((draft.routesPerDay / evidence.recentPlanningRoutesPerDay) - 1) * 100).toFixed(1)) : 0} onChange={(event) => {
                  const growth = number(event.target.value);
                  setDraft({ ...draft, routesPerDay: evidence.recentPlanningRoutesPerDay * (1 + growth / 100) });
                }} /><b>%</b></div>
                <small>Current BAU evidence: {formatNumber(evidence.recentPlanningRoutesPerDay, 1)} routes/day</small>
              </label>
              <label>
                <span>Planned routes per day</span>
                <input type="number" min="1" max="250" step="0.1" value={draft.routesPerDay} onChange={(event) => setDraft({ ...draft, routesPerDay: number(event.target.value) })} />
                <small>Evidence: {formatNumber(evidence.peakPlanningRoutesPerDay, 1)} average–{formatNumber(evidence.peakMaximumRoutesPerDay)} max</small>
              </label>
              <label>
                <span>Service days per week</span>
                <input type="number" min="1" max="7" step="1" value={draft.serviceDays} onChange={(event) => setDraft({ ...draft, serviceDays: number(event.target.value) })} />
                <small>Peak default: 7</small>
              </label>
              <label>
                <span>Driver days per week</span>
                <input type="number" min="1" max="7" step="1" value={draft.driverDays} onChange={(event) => setDraft({ ...draft, driverDays: number(event.target.value) })} />
                <small>BPV Peak convention: 6</small>
              </label>
              <label>
                <span>Coverage reserve</span>
                <div className={styles.percentInput}><input type="number" min="0" max="100" step="0.5" value={draft.reservePercent} onChange={(event) => setDraft({ ...draft, reservePercent: number(event.target.value) })} /><b>%</b></div>
                <small>Planning default: 12.5%</small>
              </label>
            </div>
            <footer>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowEditor(false)}>Cancel</button>
              <button type="button" className={styles.primaryButton} onClick={applyDraft}>Apply scenario</button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
