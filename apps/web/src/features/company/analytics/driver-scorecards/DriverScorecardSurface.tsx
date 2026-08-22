"use client";

import { useEffect, useRef, useState } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import {
  hasPickupExceptionActivity,
  pickupContribution,
  routeDayCost,
  scorecardNumber,
  sourceLabel,
  standardLabel,
  warehouseCoverage,
} from "./driverScorecard";
import type {
  DriverPeriodSummary,
  DriverScorecardDetailPayload,
  DriverScorecardDetailRow,
  DriverScorecardIndexPayload,
  DriverScorecardIndexRow,
  ScorecardMetric,
  ScorecardPeriodKey,
} from "./driverScorecard.types";
import { calculatePickupReliability } from "../pickupReliability";
import styles from "./driver-scorecard.module.css";

type View = "TEAM" | "DRIVER";

const indexCache = new Map<string, Promise<DriverScorecardIndexPayload>>();
const detailCache = new Map<string, Promise<DriverScorecardDetailPayload>>();

const number = (value: unknown, digits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
    scorecardNumber(value),
  );
const money = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
const preciseMoney = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
const percent = (value: unknown) =>
  value == null ? "—" : `${number(value, 2)}%`;
const date = (value: string | null | undefined, year = true) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        ...(year ? { year: "numeric" } : {}),
        timeZone: "UTC",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : "—";

const periodLabels: Record<ScorecardPeriodKey, string> = {
  LAST_5_WEEKS: "Last 5 complete weeks",
  LAST_MONTH: "Last month",
  MTD: "Month to date",
  CONTRACT: "Selected range",
};

function loadIndex(
  slug: string,
  startDate: string,
  endDate: string,
  asOfDate: string,
) {
  const key = `${slug}:${startDate}:${endDate}:${asOfDate}`;
  let request = indexCache.get(key);
  if (!request) {
    request = fetch(
      `/api/company/${slug}/analytics/driver-scorecards?startDate=${startDate}&endDate=${endDate}&asOfDate=${asOfDate}`,
      { credentials: "include", cache: "no-store" },
    ).then(async (response) => {
      const body = (await response.json()) as DriverScorecardIndexPayload;
      if (!response.ok)
        throw new Error(body.error ?? "Unable to load Driver Scorecards.");
      return body;
    });
    indexCache.set(key, request);
  }
  return request;
}

function loadDetail(
  slug: string,
  rosterId: string,
  startDate: string,
  endDate: string,
  asOfDate: string,
) {
  const key = `${slug}:${rosterId}:${startDate}:${endDate}:${asOfDate}`;
  let request = detailCache.get(key);
  if (!request) {
    request = fetch(
      `/api/company/${slug}/analytics/driver-scorecards?startDate=${startDate}&endDate=${endDate}&asOfDate=${asOfDate}&rosterId=${rosterId}`,
      { credentials: "include", cache: "no-store" },
    ).then(async (response) => {
      const body = (await response.json()) as DriverScorecardDetailPayload;
      if (!response.ok)
        throw new Error(body.error ?? "Unable to load this driver report.");
      return body;
    });
    detailCache.set(key, request);
  }
  return request;
}

function MetricValue({
  metric,
  period,
}: {
  metric: ScorecardMetric;
  period: DriverPeriodSummary | undefined;
}) {
  if (!period) return <span className={styles.missingValue}>No sample</span>;
  if (metric.metric_key !== "PICKUPS")
    return <span className={styles.missingValue}>Source needed</span>;
  const result = pickupContribution(period, metric);
  if (result.status === "INCOMPLETE")
    return <span className={styles.reviewValue}>PRI incomplete</span>;
  if (result.status === "NO_SAMPLE")
    return <span className={styles.missingValue}>No sample</span>;
  return (
    <span
      className={
        `${styles.metricResult} ${
          result.contribution === 0
            ? styles.zeroValue
            : hasPickupExceptionActivity(period)
              ? styles.exceptionMetricValue
              : styles.connectedValue
        }`
      }
    >
      <strong>
        {result.tier} · {number(result.contribution, 1)} /{" "}
        {number(metric.contribution_weight)}
      </strong>
      <small>PRI {result.pri?.toFixed(3)}</small>
    </span>
  );
}

export default function DriverScorecardSurface({ slug }: { slug: string }) {
  const {
    payload: contract,
    payloadLoading,
    error: contractError,
    loadedYear,
  } = useAnalyticsData();
  const [payload, setPayload] = useState<DriverScorecardIndexPayload | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("TEAM");
  const [periodKey, setPeriodKey] =
    useState<ScorecardPeriodKey>("LAST_5_WEEKS");
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DriverScorecardDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailSequence = useRef(0);

  const startDate = contract?.metadata.start_date ?? null;
  const endDate = contract?.metadata.end_date ?? null;
  const asOfDate = contract?.metadata.through_service_date ?? null;

  useEffect(() => {
    if (!startDate || !endDate || !asOfDate) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) setLoading(true);
        return loadIndex(slug, startDate, endDate, asOfDate);
      })
      .then((value) => {
        if (!active) return;
        setPayload(value);
        setError(null);
        setSelectedRosterId(
          (current) =>
            current ??
            value.drivers.find(
              (driver) =>
                scorecardNumber(driver.periods.CONTRACT?.route_days) > 0,
            )?.roster_id ??
            value.drivers[0]?.roster_id ??
            null,
        );
      })
      .catch((caught) => {
        if (!active) return;
        indexCache.delete(`${slug}:${startDate}:${endDate}:${asOfDate}`);
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Driver Scorecards.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asOfDate, endDate, slug, startDate]);

  const metrics = payload?.model.metrics ?? [];
  const pickupMetric = metrics.find(
    (metric) => metric.metric_key === "PICKUPS",
  );
  const coverage = warehouseCoverage(metrics);
  const selectedDriver =
    payload?.drivers.find((driver) => driver.roster_id === selectedRosterId) ??
    null;
  const hasFiveWeekFacts = Boolean(
    payload?.range.last_five_weeks_start &&
      payload?.range.last_five_weeks_end,
  );
  const availablePeriodKeys: ScorecardPeriodKey[] = hasFiveWeekFacts
    ? ["LAST_5_WEEKS", "LAST_MONTH", "MTD", "CONTRACT"]
    : ["LAST_MONTH", "MTD", "CONTRACT"];
  const selectedPeriod =
    selectedDriver?.periods[periodKey] ??
    (periodKey === "LAST_5_WEEKS"
      ? selectedDriver?.periods.LAST_MONTH
      : undefined) ??
    null;
  const selectedHasPickupExceptions = selectedPeriod
    ? hasPickupExceptionActivity(selectedPeriod)
    : false;

  const teamPeriod = (driver: DriverScorecardIndexRow) =>
    driver.periods.LAST_5_WEEKS ?? driver.periods.LAST_MONTH;

  const teamRows = [...(payload?.drivers ?? [])].sort((left, right) => {
    const leftPeriod = teamPeriod(left);
    const rightPeriod = teamPeriod(right);
    const leftContribution = leftPeriod
      ? (pickupContribution(leftPeriod, pickupMetric).contribution ?? -1)
      : -1;
    const rightContribution = rightPeriod
      ? (pickupContribution(rightPeriod, pickupMetric).contribution ?? -1)
      : -1;
    return (
      rightContribution - leftContribution ||
      scorecardNumber(leftPeriod?.potential_missed_pickups) -
        scorecardNumber(rightPeriod?.potential_missed_pickups) ||
      left.full_name.localeCompare(right.full_name)
    );
  });

  function chooseDriver(driver: DriverScorecardIndexRow) {
    setSelectedRosterId(driver.roster_id);
    setView("DRIVER");
  }

  useEffect(() => {
    if (
      view !== "DRIVER" ||
      !selectedRosterId ||
      !startDate ||
      !endDate ||
      !asOfDate
    )
      return;
    const sequence = detailSequence.current + 1;
    detailSequence.current = sequence;
    Promise.resolve()
      .then(() => {
        if (detailSequence.current === sequence) {
          setDetailLoading(true);
          setDetailError(null);
        }
        return loadDetail(slug, selectedRosterId, startDate, endDate, asOfDate);
      })
      .then((value) => {
        if (detailSequence.current === sequence) setDetail(value.rows ?? []);
      })
      .catch((caught) => {
        if (detailSequence.current !== sequence) return;
        detailCache.delete(
          `${slug}:${selectedRosterId}:${startDate}:${endDate}:${asOfDate}`,
        );
        setDetailError(
          caught instanceof Error
            ? caught.message
            : "Unable to load this driver report.",
        );
      })
      .finally(() => {
        if (detailSequence.current === sequence) setDetailLoading(false);
      });
  }, [asOfDate, endDate, selectedRosterId, slug, startDate, view]);

  const periodDetail = detail.filter((row) => {
    if (!payload) return false;
    if (
      periodKey === "LAST_5_WEEKS" &&
      payload.range.last_five_weeks_start &&
      payload.range.last_five_weeks_end
    )
      return (
        row.service_date >= payload.range.last_five_weeks_start &&
        row.service_date <= payload.range.last_five_weeks_end
      );
    if (periodKey === "LAST_MONTH")
      return (
        row.service_date >= payload.range.last_month_start &&
        row.service_date <= payload.range.last_month_end
      );
    if (periodKey === "MTD")
      return (
        row.service_date >= payload.range.mtd_start &&
        row.service_date <= payload.range.as_of_date
      );
    return true;
  });

  const routes = [
    ...new Set(
      periodDetail
        .map((row) => row.route_name || row.wa_number)
        .filter(Boolean),
    ),
  ] as string[];
  const cost =
    selectedDriver && selectedPeriod
      ? routeDayCost(selectedDriver, selectedPeriod)
      : null;

  return (
    <main className="workspace-shell">
      <section
        className="workspace-main"
        style={{ paddingTop: 0, paddingBottom: 36 }}
      >
        <article className={styles.report}>
          <header className={styles.hero}>
            <div>
              <p>Analytics · Driver performance</p>
              <h1>Driver Scorecards</h1>
              <span>
                One scoring standard, two views: team contribution readiness and
                selected-driver evidence.
              </span>
            </div>
            <div className={styles.contractContext}>
              <span>Shared analytics context</span>
              <strong>Calendar year {loadedYear ?? "—"}</strong>
              <small>
                {startDate && endDate
                  ? `${date(startDate)} – ${date(endDate)}`
                  : "Loading calendar range…"}
              </small>
              <small>Warehouse current through {date(asOfDate)}</small>
            </div>
          </header>

          <div className={styles.viewSwitch}>
            <div>
              {(["TEAM", "DRIVER"] as View[]).map((item) => (
                <button
                  className={view === item ? styles.activeView : ""}
                  key={item}
                  onClick={() => setView(item)}
                  type="button"
                >
                  {item === "TEAM" ? "Team ranking" : "Driver drill-down"}
                </button>
              ))}
            </div>
            <span>
              {payload?.model.title ?? "Seeded score model"} · v
              {payload?.model.version ?? 1}
            </span>
          </div>

          {payloadLoading || loading ? (
            <div className={styles.state}>
              Loading the reconciled driver scorecard facts…
            </div>
          ) : null}
          {contractError || error ? (
            <div className={`${styles.state} ${styles.error}`}>
              <strong>Driver Scorecards unavailable.</strong>
              <span>{contractError || error}</span>
            </div>
          ) : null}

          {!payloadLoading &&
          !loading &&
          !contractError &&
          !error &&
          payload ? (
            <>
              <section className={styles.coverageStrip}>
                <article>
                  <span>Score weight connected</span>
                  <strong>{number(coverage)} / 100</strong>
                  <small>Defensible warehouse contribution</small>
                </article>
                <article>
                  <span>Drivers connected</span>
                  <strong>
                    {number(
                      payload.drivers.filter(
                        (driver) =>
                          scorecardNumber(driver.periods.CONTRACT?.route_days) >
                          0,
                      ).length,
                    )}
                  </strong>
                  <small>Active roster with FINAL DSW evidence</small>
                </article>
                <article>
                  <span>External metric weight</span>
                  <strong>
                    {number(
                      metrics
                        .filter(
                          (metric) => metric.source_mode === "FEDEX_IMPORT",
                        )
                        .reduce(
                          (sum, metric) =>
                            sum + scorecardNumber(metric.contribution_weight),
                          0,
                        ),
                    )}
                  </strong>
                  <small>FedEx import pipeline required</small>
                </article>
                <article>
                  <span>Event ledger weight</span>
                  <strong>
                    {number(
                      metrics
                        .filter(
                          (metric) => metric.source_mode === "EVENT_LEDGER",
                        )
                        .reduce(
                          (sum, metric) =>
                            sum + scorecardNumber(metric.contribution_weight),
                          0,
                        ),
                    )}
                  </strong>
                  <small>Confirmed incident capture required</small>
                </article>
                <article
                  className={
                    payload.unmatched_route_rows ? styles.warningCard : ""
                  }
                >
                  <span>Unmatched route rows</span>
                  <strong>{number(payload.unmatched_route_rows)}</strong>
                  <small>Excluded from driver ownership</small>
                </article>
              </section>

              <div className={styles.truthNotice}>
                <strong>Ranking remains unpublished.</strong>
                <span>
                  The warehouse currently supports the 18-point pickup
                  contribution. Missing FedEx and safety-event measures are
                  shown as source gaps, not zero scores.
                </span>
              </div>

              {view === "TEAM" ? (
                <>
                  <section className={styles.panel}>
                    <header className={styles.sectionHead}>
                      <div>
                        <p>Team scorecard</p>
                        <h2>Contribution table</h2>
                        <span>
                          Admin review uses names for selection. Team print/PDF
                          will publish top-five names only and FX IDs for every
                          other position.
                        </span>
                      </div>
                      <div className={styles.periodBadge}>
                        {hasFiveWeekFacts
                          ? "Last 5 complete weeks"
                          : "Last complete month"}{" "}
                        ·{" "}
                        {date(
                          hasFiveWeekFacts
                            ? payload.range.last_five_weeks_start
                            : payload.range.last_month_start,
                          false,
                        )}
                        –
                        {date(
                          hasFiveWeekFacts
                            ? payload.range.last_five_weeks_end
                            : payload.range.last_month_end,
                        )}
                      </div>
                    </header>
                    <div className={styles.teamTable}>
                      <div className={styles.teamHead}>
                        <span>Rank</span>
                        <span>Driver</span>
                        {metrics.map((metric) => (
                          <span key={metric.metric_key}>
                            {metric.display_name}
                            <small>
                              {number(metric.contribution_weight)} pts
                            </small>
                          </span>
                        ))}
                        <span>Total</span>
                      </div>
                      <div className={styles.teamRows}>
                        {teamRows.map((driver) => (
                          <button
                            key={driver.roster_id}
                            onClick={() => chooseDriver(driver)}
                            type="button"
                          >
                            <span>—</span>
                            <span>
                              <strong>{driver.full_name}</strong>
                              <small>
                                {driver.fx_id
                                  ? `FX ${driver.fx_id}`
                                  : "FX ID missing"}{" "}
                                ·{" "}
                                {number(
                                  teamPeriod(driver)?.route_days,
                                )}{" "}
                                route-days
                              </small>
                            </span>
                            {metrics.map((metric) => (
                              <MetricValue
                                key={metric.metric_key}
                                metric={metric}
                                period={teamPeriod(driver)}
                              />
                            ))}
                            <span className={styles.incompleteTotal}>
                              Incomplete
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className={styles.standards}>
                    <header className={styles.sectionHead}>
                      <div>
                        <p>Scoring setup</p>
                        <h2>Seeded weights and standards</h2>
                        <span>
                          Client configuration will keep this same short
                          structure: turn a KPI on or off, set its weight, and
                          adjust its visible standard.
                        </span>
                      </div>
                      <strong>
                        {number(
                          metrics.reduce(
                            (sum, metric) =>
                              sum + scorecardNumber(metric.contribution_weight),
                            0,
                          ),
                        )}
                        % configured
                      </strong>
                    </header>
                    <div className={styles.standardHead}>
                      <span>KPI</span>
                      <span>Weight</span>
                      <span>Contribution standard</span>
                      <span>Data source</span>
                    </div>
                    <div className={styles.standardRows}>
                      {metrics.map((metric) => (
                        <article key={metric.metric_key}>
                          <span>
                            <small>{metric.category_key}</small>
                            <strong>{metric.display_name}</strong>
                          </span>
                          <b>{number(metric.contribution_weight)}%</b>
                          <span>{standardLabel(metric)}</span>
                          <span>{sourceLabel(metric)}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {view === "DRIVER" ? (
                <section className={styles.drillGrid}>
                  <aside className={styles.driverRail}>
                    <header>
                      <p>Driver index</p>
                      <h2>Select driver</h2>
                    </header>
                    <div>
                      {teamRows.map((driver) => (
                        <button
                          className={
                            driver.roster_id === selectedRosterId
                              ? styles.selectedDriver
                              : ""
                          }
                          key={driver.roster_id}
                          onClick={() => setSelectedRosterId(driver.roster_id)}
                          type="button"
                        >
                          <span>
                            <strong>{driver.full_name}</strong>
                            <small>
                              {driver.fx_id
                                ? `FX ${driver.fx_id}`
                                : "FX ID missing"}
                            </small>
                          </span>
                          <b>
                            {number(driver.periods.CONTRACT?.route_days)} days
                          </b>
                        </button>
                      ))}
                    </div>
                  </aside>

                  <article className={styles.driverReport}>
                    {selectedDriver && selectedPeriod ? (
                      <>
                        <header className={styles.driverHeader}>
                          <div>
                            <span>Administrative driver report</span>
                            <h2>{selectedDriver.full_name}</h2>
                            <small>
                              FX {selectedDriver.fx_id ?? "—"} ·{" "}
                              {selectedDriver.employment_status}
                            </small>
                          </div>
                          <div>
                            <strong>Incomplete</strong>
                            <small>
                              {number(coverage)}% score weight connected
                            </small>
                          </div>
                        </header>
                        <div className={styles.periodTabs}>
                          {availablePeriodKeys.map((key) => (
                            <button
                              className={
                                periodKey === key ? styles.activePeriod : ""
                              }
                              key={key}
                              onClick={() => setPeriodKey(key)}
                              type="button"
                            >
                              {periodLabels[key]}
                            </button>
                          ))}
                        </div>

                        <section className={styles.kpiGrid}>
                          {metrics.map((metric) => (
                            <article
                              className={[
                                metric.source_mode === "WAREHOUSE"
                                  ? styles.connectedKpi
                                  : "",
                                metric.metric_key === "PICKUPS" &&
                                selectedHasPickupExceptions
                                  ? styles.pickupExceptionKpi
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              key={metric.metric_key}
                            >
                              <span>
                                {metric.category_key} ·{" "}
                                {number(metric.contribution_weight)} pts
                              </span>
                              <strong>{metric.display_name}</strong>
                              <MetricValue
                                metric={metric}
                                period={selectedPeriod}
                              />
                              <small>{sourceLabel(metric)}</small>
                            </article>
                          ))}
                        </section>

                        <section className={styles.operatingLens}>
                          <header>
                            <p>Known operating contribution</p>
                            <h3>{periodLabels[periodKey]}</h3>
                          </header>
                          <div>
                            <article>
                              <span>Route-days</span>
                              <strong>
                                {number(selectedPeriod.route_days)}
                              </strong>
                            </article>
                            <article>
                              <span>Delivery stops</span>
                              <strong>
                                {number(selectedPeriod.delivery_stops)}
                              </strong>
                            </article>
                            <article>
                              <span>Packages</span>
                              <strong>
                                {number(selectedPeriod.delivery_packages)}
                              </strong>
                            </article>
                            <article>
                              <span>PU stops</span>
                              <strong>
                                {number(selectedPeriod.pickup_stops)}
                              </strong>
                            </article>
                            <article
                              className={
                                scorecardNumber(
                                  selectedPeriod.early_pickups,
                                ) > 0 ||
                                scorecardNumber(selectedPeriod.late_pickups) >
                                  0
                                  ? styles.pickupExceptionField
                                  : ""
                              }
                            >
                              <span>Early / Late</span>
                              <strong>
                                {number(selectedPeriod.early_pickups)} /{" "}
                                {number(selectedPeriod.late_pickups)}
                              </strong>
                            </article>
                            <article
                              className={
                                scorecardNumber(
                                  selectedPeriod.potential_missed_pickups,
                                ) > 0
                                  ? styles.pickupExceptionField
                                  : ""
                              }
                            >
                              <span>Potential missed</span>
                              <strong>
                                {number(
                                  selectedPeriod.potential_missed_pickups,
                                )}
                              </strong>
                            </article>
                            <article>
                              <span>Exceptions</span>
                              <strong>
                                {number(selectedPeriod.exceptions)}
                              </strong>
                            </article>
                            <article>
                              <span>Observed ILS</span>
                              <strong>
                                {percent(selectedPeriod.observed_ils)}
                              </strong>
                              <small>Informational—not LIB</small>
                            </article>
                          </div>
                        </section>

                        <section className={styles.costLens}>
                          <header>
                            <p>Known cost lens</p>
                            <h3>Labor against operated work</h3>
                            <span>
                              Daily pay only. Vehicle, fuel, claims, and
                              overhead remain outside this first model.
                            </span>
                          </header>
                          <div>
                            <article>
                              <span>Known daily rate</span>
                              <strong>
                                {money(cost?.laborPerDay ?? null)}
                              </strong>
                            </article>
                            <article>
                              <span>Period labor</span>
                              <strong>
                                {money(cost?.estimatedLabor ?? null)}
                              </strong>
                            </article>
                            <article>
                              <span>Labor / delivery stop</span>
                              <strong>
                                {cost?.laborPerStop == null
                                  ? "—"
                                  : preciseMoney(cost.laborPerStop)}
                              </strong>
                            </article>
                            <article>
                              <span>Routes observed</span>
                              <strong>
                                {routes.length ? number(routes.length) : "—"}
                              </strong>
                              <small>
                                {routes.slice(0, 3).join(" · ") ||
                                  "Scoped detail loading"}
                              </small>
                            </article>
                          </div>
                        </section>

                        <section className={styles.evidencePanel}>
                          <header className={styles.sectionHead}>
                            <div>
                              <p>Scoped warehouse evidence</p>
                              <h2>Recent operating days</h2>
                              <span>Loaded only for the selected driver.</span>
                            </div>
                          </header>
                          {detailLoading ? (
                            <div className={styles.inlineState}>
                              Loading selected-driver evidence…
                            </div>
                          ) : null}
                          {detailError ? (
                            <div
                              className={`${styles.inlineState} ${styles.error}`}
                            >
                              {detailError}
                            </div>
                          ) : null}
                          {!detailLoading && !detailError ? (
                            <div className={styles.evidenceTable}>
                              <div className={styles.evidenceHead}>
                                <span>Date</span>
                                <span>Route</span>
                                <span>Stops</span>
                                <span>Packages</span>
                                <span>PU</span>
                                <span>E / L / M</span>
                                <span>PRI</span>
                                <span>Exceptions</span>
                                <span>Miles</span>
                              </div>
                              <div>
                                {[...periodDetail]
                                  .reverse()
                                  .slice(0, 18)
                                  .map((row, index) => {
                                    const dailyReliability =
                                      calculatePickupReliability({
                                        pickupStops: row.pickup_stops,
                                        earlyPickups: row.early_pickups,
                                        latePickups: row.late_pickups,
                                        potentialMissedPickups:
                                          row.potential_missed_pickups,
                                        complete:
                                          scorecardNumber(row.pickup_stops) > 0,
                                      });
                                    return (
                                      <div
                                        key={`${row.service_date}:${row.route_name}:${index}`}
                                      >
                                      <strong>
                                        {date(row.service_date, false)}
                                      </strong>
                                      <span>
                                        {row.route_name || row.wa_number || "—"}
                                      </span>
                                      <span>{number(row.delivery_stops)}</span>
                                      <span>
                                        {number(row.delivery_packages)}
                                      </span>
                                      <span>{number(row.pickup_stops)}</span>
                                      <span
                                        className={
                                          hasPickupExceptionActivity(row)
                                            ? styles.pickupExceptionValue
                                            : ""
                                        }
                                      >
                                        {number(row.early_pickups)} /{" "}
                                        {number(row.late_pickups)} /{" "}
                                        {number(row.potential_missed_pickups)}
                                      </span>
                                      <span
                                        className={`${styles.dailyPri} ${
                                          dailyReliability.tier === "T1"
                                            ? styles.zeroValue
                                            : hasPickupExceptionActivity(row)
                                              ? styles.exceptionMetricValue
                                              : styles.connectedValue
                                        }`}
                                      >
                                        {dailyReliability.pri == null ? (
                                          "—"
                                        ) : (
                                          <>
                                            <strong>
                                              {dailyReliability.tier}
                                            </strong>
                                            <small>
                                              {dailyReliability.pri.toFixed(3)}
                                            </small>
                                          </>
                                        )}
                                      </span>
                                      <span>{number(row.exceptions)}</span>
                                      <span>{number(row.miles, 1)}</span>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : null}
                        </section>
                      </>
                    ) : (
                      <div className={styles.inlineState}>
                        Select a driver to begin.
                      </div>
                    )}
                  </article>
                </section>
              ) : null}

              <footer className={styles.methodology}>
                Warehouse scope: latest retained FINAL DSW row for each contract
                operating day, resolved to the authoritative roster. Potential
                missed pickups remain provisional. Required-signature volume and
                observed ILS are retained as context only and are not
                substituted for signature compliance or LIB.
              </footer>
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}
