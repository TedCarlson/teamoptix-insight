"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import type { RouteCapacityPayload, RouteCapacityRow } from "../routeCapacity.types";
import { routeCapacityNumber } from "../routeCapacity.helpers";
import { buildRouteChallengeProfile, buildRouteDriverEvidence, buildRouteProfiles } from "./routeIntelligence";
import styles from "./route-intelligence.module.css";

type RouteIndexRow = {
  id: string;
  route_name: string;
  current_wa_num: string | null;
  route_type: string | null;
  route_location: string | null;
  effective_start: string;
  effective_end: string | null;
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
};

type RouteIndexPayload = { routes?: RouteIndexRow[]; error?: string };

const routeIndexCache = new Map<string, Promise<RouteIndexRow[]>>();
const routeDetailCache = new Map<string, Promise<RouteCapacityPayload>>();

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

const percent = (value: number | null, digits = 0) =>
  value == null ? "—" : `${number(value * 100, digits)}%`;

function date(value: string | null | undefined, year = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function month(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00Z`));
}

const weekdayLabels: Record<number, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

const basisLabels = {
  ROUTE_WEEKDAY: "Route + weekday",
  ROUTE: "Route history",
  COMPANY_WEEKDAY: "Company + weekday",
  COMPANY: "Company history",
  INSUFFICIENT_HISTORY: "Insufficient route history",
} as const;

const bandLabels = {
  LIGHT: "Light",
  NORMAL: "Normal",
  NORMAL_LOW_CONFIDENCE: "Normal · low confidence",
  HEAVY: "Heavy",
  EXTREME: "Extreme",
} as const;

function scheduledDays(route: RouteIndexRow) {
  return [route.runs_s, route.runs_u, route.runs_m, route.runs_t, route.runs_w, route.runs_h, route.runs_f]
    .filter(Boolean).length;
}

function loadRouteIndex(slug: string) {
  let request = routeIndexCache.get(slug);
  if (!request) {
    request = fetch(`/api/company/${slug}/routes/history`, {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const body = (await response.json()) as RouteIndexPayload;
      if (!response.ok) throw new Error(body.error ?? "Unable to load the route index.");
      return body.routes ?? [];
    });
    routeIndexCache.set(slug, request);
  }
  return request;
}

function loadRouteDetail(slug: string, routeId: string, startDate: string, endDate: string) {
  const key = `${slug}:${routeId}:${startDate}:${endDate}`;
  let request = routeDetailCache.get(key);
  if (!request) {
    request = fetch(`/api/company/${slug}/analytics/route-capacity?routeId=${encodeURIComponent(routeId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      const body = (await response.json()) as RouteCapacityPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to build this route report.");
      return body;
    });
    routeDetailCache.set(key, request);
  }
  return request;
}

export default function RouteIntelligenceSurface({ slug }: { slug: string }) {
  const { payload: contract, payloadLoading, error: contractError, loadedYear } = useAnalyticsData();
  const [routes, setRoutes] = useState<RouteIndexRow[]>([]);
  const [routeIndexLoading, setRouteIndexLoading] = useState(true);
  const [routeIndexError, setRouteIndexError] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteCapacityPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailSequence = useRef(0);

  const startDate = contract?.metadata.start_date ?? null;
  const contractEndDate = contract?.metadata.end_date ?? null;
  const throughDate = contract?.metadata.through_service_date ?? null;

  useEffect(() => {
    let active = true;
    loadRouteIndex(slug)
      .then((rows) => {
        if (!active) return;
        setRoutes(rows);
        setRouteIndexError(null);
      })
      .catch((caught) => {
        if (!active) return;
        routeIndexCache.delete(slug);
        setRouteIndexError(caught instanceof Error ? caught.message : "Unable to load the route index.");
      })
      .finally(() => { if (active) setRouteIndexLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const contractRoutes = useMemo(() => {
    const logicalRoutes = new Map<string, RouteIndexRow>();
    for (const route of routes) {
      if ((contractEndDate && route.effective_start > contractEndDate) || (route.effective_end && startDate && route.effective_end < startDate)) continue;
      const key = route.route_name.trim().toLowerCase();
      const current = logicalRoutes.get(key);
      if (!current || route.effective_start > current.effective_start) logicalRoutes.set(key, route);
    }
    return [...logicalRoutes.values()].filter((route) => {
      const needle = routeFilter.trim().toLowerCase();
      return !needle || `${route.route_name} ${route.current_wa_num ?? ""} ${route.route_location ?? ""}`.toLowerCase().includes(needle);
    })
      .sort((a, b) => a.route_name.localeCompare(b.route_name));
  }, [contractEndDate, routeFilter, routes, startDate]);

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;

  function selectRoute(route: RouteIndexRow) {
    const requestId = detailSequence.current + 1;
    detailSequence.current = requestId;
    setSelectedRouteId(route.id);
    setDetail(null);
    setDetailError(null);
    if (!startDate || !throughDate) return;
    setDetailLoading(true);
    loadRouteDetail(slug, route.id, startDate, throughDate)
      .then((payload) => {
        if (detailSequence.current === requestId) setDetail(payload);
      })
      .catch((caught) => {
        if (detailSequence.current !== requestId) return;
        routeDetailCache.delete(`${slug}:${route.id}:${startDate}:${throughDate}`);
        setDetailError(caught instanceof Error ? caught.message : "Unable to build this route report.");
      })
      .finally(() => {
        if (detailSequence.current === requestId) setDetailLoading(false);
      });
  }

  const general = useMemo(() => {
    const rows = contract?.rows ?? [];
    const totals = rows.reduce((acc, row) => ({
      routes: acc.routes + routeCapacityNumber(row.route_count),
      stops: acc.stops + routeCapacityNumber(row.actual_delivery_stops),
      packages: acc.packages + routeCapacityNumber(row.actual_delivery_packages),
      pickups: acc.pickups + routeCapacityNumber(row.actual_pickup_stops),
    }), { routes: 0, stops: 0, packages: 0, pickups: 0 });
    return {
      operatingDays: rows.length,
      averageRoutes: rows.length ? totals.routes / rows.length : 0,
      stopsPerRoute: totals.routes ? totals.stops / totals.routes : 0,
      packagesPerStop: totals.stops ? totals.packages / totals.stops : 0,
      pickupsPerDay: rows.length ? totals.pickups / rows.length : 0,
    };
  }, [contract]);

  const generalMonths = useMemo(() => {
    const groups = new Map<string, { days: number; routes: number; stops: number; packages: number; pickups: number }>();
    for (const row of contract?.rows ?? []) {
      const key = row.service_date.slice(0, 7);
      const current = groups.get(key) ?? { days: 0, routes: 0, stops: 0, packages: 0, pickups: 0 };
      current.days += 1;
      current.routes += routeCapacityNumber(row.route_count);
      current.stops += routeCapacityNumber(row.actual_delivery_stops);
      current.packages += routeCapacityNumber(row.actual_delivery_packages);
      current.pickups += routeCapacityNumber(row.actual_pickup_stops);
      groups.set(key, current);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
      month: key,
      routesPerDay: value.days ? value.routes / value.days : 0,
      stopsPerRoute: value.routes ? value.stops / value.routes : 0,
      packagesPerStop: value.stops ? value.packages / value.stops : 0,
      pickupsPerDay: value.days ? value.pickups / value.days : 0,
    }));
  }, [contract]);

  const profile = useMemo(() => buildRouteProfiles(detail?.rows ?? [])[0] ?? null, [detail]);
  const driverEvidence = useMemo(
    () => buildRouteDriverEvidence(detail?.drivers ?? []),
    [detail]
  );
  const recommendedDriver = driverEvidence[0] ?? null;
  const routeChallenge = useMemo(
    () => buildRouteChallengeProfile(detail?.route_metrics),
    [detail]
  );
  const selectedRows = useMemo(() => [...(detail?.rows ?? [])].sort((a, b) => b.service_date.localeCompare(a.service_date)).slice(0, 12), [detail]);
  const maxWeekdayStops = Math.max(1, ...(profile?.weekdays.map((item) => item.averageStops) ?? []));

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 36 }}>
        <article className={styles.report}>
          <header className={styles.hero}>
            <div><p>Analytics · Route Intelligence</p><h1>Route Intelligence</h1><span>General contract route behavior from the shared analytics record, with route-specific reports calculated only when selected.</span></div>
            <div className={styles.contractContext}><span>Shared contract context</span><strong>Contract year {loadedYear ?? "—"}</strong><small>{startDate && contractEndDate ? `${date(startDate)} – ${date(contractEndDate)}` : "Loading contract block…"}</small><small>Current through {date(throughDate)}</small></div>
          </header>

          {payloadLoading ? <div className={styles.state}>Reading the shared contract record…</div> : null}
          {contractError ? <div className={`${styles.state} ${styles.error}`}><strong>Route Intelligence unavailable.</strong><span>{contractError}</span></div> : null}

          {!payloadLoading && !contractError && contract ? (
            <>
              <section className={styles.summary}>
                <article><span>Operating days</span><strong>{number(general.operatingDays)}</strong><small>FINAL DSW days already in memory</small></article>
                <article><span>Routes / day</span><strong>{number(general.averageRoutes, 1)}</strong><small>Average deployed route count</small></article>
                <article><span>Stops / route</span><strong>{number(general.stopsPerRoute, 1)}</strong><small>Total stops divided by route-days</small></article>
                <article><span>Packages / stop</span><strong>{number(general.packagesPerStop, 2)}</strong><small>Contract delivery density</small></article>
                <article><span>PU stops / day</span><strong>{number(general.pickupsPerDay, 1)}</strong><small>Average pickup demand</small></article>
              </section>

              <section className={styles.trendPanel}>
                <header className={styles.sectionHead}><div><p>General route analysis</p><h2>Deployed route pattern</h2><span>These measures use the shared daily DSW facts only. No route-detail query is made for this section.</span></div></header>
                <div className={styles.generalMonthHead}><span>Month</span><span>Routes / day</span><span>Stops / route</span><span>Packages / stop</span><span>PU stops / day</span></div>
                <div className={styles.generalMonthRows}>
                  {generalMonths.map((row) => <div key={row.month}><strong>{month(row.month)}</strong><span>{number(row.routesPerDay, 1)}</span><span>{number(row.stopsPerRoute, 1)}</span><span>{number(row.packagesPerStop, 2)}</span><span>{number(row.pickupsPerDay, 1)}</span></div>)}
                </div>
              </section>

              <section className={styles.routeReviewGrid}>
                <aside className={styles.routeRail}>
                  <header><p>Route index</p><h2>Select a route</h2><span>Selection initiates one scoped DSW report.</span></header>
                  <input aria-label="Filter routes" onChange={(event) => setRouteFilter(event.target.value)} placeholder="Filter route or WA…" type="search" value={routeFilter} />
                  {routeIndexLoading ? <div className={styles.railState}>Loading route index…</div> : null}
                  {routeIndexError ? <div className={`${styles.railState} ${styles.error}`}>{routeIndexError}</div> : null}
                  <div className={styles.routeList}>
                    {contractRoutes.map((route) => (
                      <button className={route.id === selectedRouteId ? styles.selectedRailRoute : ""} key={route.id} onClick={() => selectRoute(route)} type="button">
                        <span><strong>{route.route_name}</strong><small>{route.current_wa_num ? `WA ${route.current_wa_num}` : "No WA number"}</small></span>
                        <span><b>{route.route_type ?? "Route"}</b><small>{scheduledDays(route)} days</small></span>
                      </button>
                    ))}
                  </div>
                </aside>

                <article className={styles.deepDive}>
                  {!selectedRouteId ? <div className={styles.selectPrompt}><span>Route deep dive</span><h2>Choose a route from the rail</h2><p>The general analysis above is already complete. A route selection retrieves only that route’s contract DSW facts and builds its detailed report.</p></div> : null}
                  {selectedRouteId && detailLoading ? <div className={styles.selectPrompt}><span>Scoped route request</span><h2>Building {selectedRoute?.route_name ?? "route"}…</h2><p>Only the selected permanent route ID is being evaluated.</p></div> : null}
                  {selectedRouteId && detailError ? <div className={`${styles.selectPrompt} ${styles.error}`}><span>Route report unavailable</span><h2>{selectedRoute?.route_name}</h2><p>{detailError}</p></div> : null}

                  {selectedRouteId && !detailLoading && !detailError && profile ? (
                    <>
                      <header className={styles.routeDetailHead}><div><span>Scoped route report</span><h2>{profile.routeName}</h2><small>{profile.waNumber ? `WA ${profile.waNumber}` : "No WA number"} · {number(profile.routeDays)} contract route-days</small></div><b>{profile.confidence}</b></header>
                      <div className={styles.detailMetrics}>
                        <article><span>Avg stops</span><strong>{number(profile.averageStops, 1)}</strong></article>
                        <article><span>Pkg / stop</span><strong>{profile.packagesPerStop == null ? "—" : number(profile.packagesPerStop, 2)}</strong></article>
                        <article><span>Completion</span><strong>{percent(profile.averageCompletion)}</strong></article>
                        <article><span>Recent shift</span><strong className={profile.recentStopChange != null && Math.abs(profile.recentStopChange) >= .1 ? styles.shift : ""}>{profile.recentStopChange == null ? "—" : `${profile.recentStopChange > 0 ? "+" : ""}${percent(profile.recentStopChange)}`}</strong></article>
                      </div>
                      <div className={styles.deepDiveColumns}>
                        <section className={styles.detailSection}><header><strong>Observed workload range</strong><span>{number(profile.observedP10Stops)} / {number(profile.observedMedianStops)} / {number(profile.observedP90Stops)} stops</span></header><div className={styles.rangeTrack}><i style={{ left: `${Math.min(100, profile.observedP10Stops / Math.max(1, profile.observedP90Stops) * 100)}%` }} /><b style={{ left: `${Math.min(100, profile.observedMedianStops / Math.max(1, profile.observedP90Stops) * 100)}%` }} /></div><footer><span>P10</span><span>Median</span><span>P90</span></footer></section>
                        <section className={styles.detailSection}><header><strong>Comparable weekday profile</strong><span>Sat–Fri</span></header><div className={styles.weekdays}>{[6, 7, 1, 2, 3, 4, 5].map((weekday) => { const item = profile.weekdays.find((entry) => entry.weekday === weekday); return <div key={weekday}><span>{weekdayLabels[weekday]}</span><i><b style={{ width: `${item ? item.averageStops / maxWeekdayStops * 100 : 0}%` }} /></i><strong>{item ? number(item.averageStops) : "—"}</strong></div>; })}</div></section>
                        <section className={styles.detailSection}><header><strong>Workload bands</strong><span>{number(profile.baselineDays)} baseline days</span></header><div className={styles.bandStack}>{(Object.keys(profile.bandCounts) as Array<keyof typeof profile.bandCounts>).map((band) => profile.bandCounts[band] ? <span className={styles[`band${band}`]} key={band} style={{ flexGrow: profile.bandCounts[band] }} /> : null)}</div><div className={styles.bandLegend}><span>{profile.lightDays} light</span><span>{profile.bandCounts.NORMAL + profile.bandCounts.NORMAL_LOW_CONFIDENCE} normal</span><span>{profile.heavyDays} heavy</span><span>{profile.extremeDays} extreme</span></div></section>
                        <section className={styles.confidenceNote}><span>Comparison basis</span><strong>{basisLabels[profile.thresholdBasis]}</strong><small>{number(profile.historicalSampleSize)} prior observations · selected-route facts only</small></section>
                      </div>
                    </>
                  ) : null}
                  {selectedRouteId && !detailLoading && !detailError && detail && !profile ? <div className={styles.selectPrompt}><span>No DSW matches</span><h2>{selectedRoute?.route_name}</h2><p>No FINAL DSW facts were connected to this permanent route ID in the selected contract block.</p></div> : null}
                </article>
              </section>

              {profile && routeChallenge ? (
                <section className={styles.challengePanel}>
                  <header className={styles.sectionHead}>
                    <div>
                      <p>Observed route challenge</p>
                      <h2>Density, pace, and handling load</h2>
                      <span>Primary-driver DSW facts only. Mileage ratios use days with recorded mileage; road-hour ratios use days with recorded DOT road time.</span>
                    </div>
                    <small>{number(routeChallenge.operatingDays)} primary-driver day{routeChallenge.operatingDays === 1 ? "" : "s"}</small>
                  </header>
                  <div className={styles.challengeMetrics}>
                    <article><span>Stops / mile</span><strong>{routeChallenge.stopsPerMile == null ? "—" : number(routeChallenge.stopsPerMile, 2)}</strong><small>{number(routeChallenge.mileageDays)} mileage days</small></article>
                    <article><span>Packages / mile</span><strong>{routeChallenge.packagesPerMile == null ? "—" : number(routeChallenge.packagesPerMile, 2)}</strong><small>Geographic handling density</small></article>
                    <article><span>Stops / road hr</span><strong>{routeChallenge.stopsPerRoadHour == null ? "—" : number(routeChallenge.stopsPerRoadHour, 1)}</strong><small>{number(routeChallenge.roadHourDays)} DOT-time days</small></article>
                    <article><span>Packages / road hr</span><strong>{routeChallenge.packagesPerRoadHour == null ? "—" : number(routeChallenge.packagesPerRoadHour, 1)}</strong><small>Road-time handling pace</small></article>
                    <article><span>Stops / duty hr</span><strong>{routeChallenge.stopsPerDutyHour == null ? "—" : number(routeChallenge.stopsPerDutyHour, 1)}</strong><small>Total on-duty pace</small></article>
                    <article><span>Packages / duty hr</span><strong>{routeChallenge.packagesPerDutyHour == null ? "—" : number(routeChallenge.packagesPerDutyHour, 1)}</strong><small>Total on-duty handling</small></article>
                    <article><span>Packages / stop</span><strong>{routeChallenge.packagesPerStop == null ? "—" : number(routeChallenge.packagesPerStop, 2)}</strong><small>Stop-level handling depth</small></article>
                  </div>
                </section>
              ) : null}

              {profile && recommendedDriver ? (
                <section className={styles.driverEvidencePanel}>
                  <header className={styles.sectionHead}>
                    <div>
                      <p>Drivers with evidence on this route</p>
                      <h2>Route fit and operating record</h2>
                      <span>Ranks stored DSW facts for this selected route only. PPOD, RYDE, VEDR, and safety sources remain outside this recommendation until their ingestion paths are connected.</span>
                    </div>
                    <small>{number(driverEvidence.length)} matched driver{driverEvidence.length === 1 ? "" : "s"}</small>
                  </header>

                  <div className={styles.driverRecommendation}>
                    <div className={styles.recommendationRank}><span>Best current fit</span><strong>1</strong></div>
                    <div className={styles.recommendationIdentity}>
                      <span>Selected-route recommendation</span>
                      <h3>{recommendedDriver.driverName}</h3>
                      <small>{recommendedDriver.fxId ? `FX ${recommendedDriver.fxId}` : "Roster-matched DSW evidence"}</small>
                    </div>
                    <div className={styles.recommendationReasons}>
                      <article><span>Route familiarity</span><strong>{number(recommendedDriver.operatingDays)} days</strong><small>{number(recommendedDriver.deliveryStops)} delivery stops observed</small></article>
                      <article><span>Pickup reliability</span><strong>{recommendedDriver.priTier ?? "No PU sample"}</strong><small>{recommendedDriver.pri == null ? "No pickup denominator" : `PRI ${number(recommendedDriver.pri, 3)} · ${number(recommendedDriver.pickupStops)} PU stops`}</small></article>
                      <article><span>Service evidence</span><strong>{recommendedDriver.exceptionsPer100Stops == null ? "—" : number(recommendedDriver.exceptionsPer100Stops, 1)}</strong><small>DSW exceptions per 100 stops</small></article>
                      <article><span>Demonstrated pace</span><strong>{recommendedDriver.stopsPerDutyHour == null ? "—" : number(recommendedDriver.stopsPerDutyHour, 1)}</strong><small>Stops per duty hour</small></article>
                    </div>
                  </div>

                  <div className={styles.driverEvidenceTable}>
                    <div className={styles.driverEvidenceHead}><span>Rank</span><span>Driver</span><span>Days</span><span>Stops</span><span>Density</span><span>Pkg / stop</span><span>Road pace</span><span>Duty pace</span><span>Pickup PRI</span><span>Codes 85 / DNA / SA</span><span>Exceptions / 100</span><span>DOT road / duty</span></div>
                    <div className={styles.driverEvidenceRows}>
                      {driverEvidence.map((driver, index) => (
                        <div key={driver.rosterMemberId}>
                          <b className={index === 0 ? styles.bestRank : ""}>{index + 1}</b>
                          <span className={styles.driverEvidenceIdentity}><strong>{driver.driverName}</strong><small>{driver.fxId ? `FX ${driver.fxId}` : `${date(driver.firstServiceDate, false)} – ${date(driver.lastServiceDate, false)}`}</small></span>
                          <span>{number(driver.operatingDays)}</span>
                          <span><strong>{number(driver.deliveryStops)}</strong><small>{number(driver.averageStops, 1)} / day</small></span>
                          <span><strong>{driver.stopsPerMile == null ? "—" : number(driver.stopsPerMile, 2)}</strong><small>{driver.packagesPerMile == null ? "—" : `${number(driver.packagesPerMile, 2)} pkg / mi`}</small></span>
                          <span>{driver.packagesPerStop == null ? "—" : number(driver.packagesPerStop, 2)}</span>
                          <span><strong>{driver.stopsPerRoadHour == null ? "—" : number(driver.stopsPerRoadHour, 1)}</strong><small>{driver.packagesPerRoadHour == null ? "—" : `${number(driver.packagesPerRoadHour, 1)} pkg / hr`}</small></span>
                          <span><strong>{driver.stopsPerDutyHour == null ? "—" : number(driver.stopsPerDutyHour, 1)}</strong><small>{driver.packagesPerDutyHour == null ? "—" : `${number(driver.packagesPerDutyHour, 1)} pkg / hr`}</small></span>
                          <span className={driver.priTier === "T1" ? styles.warningValue : ""}><strong>{driver.priTier ?? "—"}</strong><small>{driver.pri == null ? "No sample" : number(driver.pri, 3)}</small></span>
                          <span>{number(driver.code85)} / {number(driver.dna)} / {number(driver.sendAgain)}</span>
                          <span>{driver.exceptionsPer100Stops == null ? "—" : number(driver.exceptionsPer100Stops, 1)}</span>
                          <span><strong>{driver.averageRoadHours == null ? "—" : `${number(driver.averageRoadHours, 1)}h`}</strong><small>{driver.averageDutyHours == null ? "—" : `${number(driver.averageDutyHours, 1)}h duty · ${number(driver.miles / Math.max(1, driver.operatingDays))} mi`}</small></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <footer className={styles.driverEvidenceNote}>Ordering: at least 3 primary-driver route-days, then pickup tier and PRI, lower DSW exceptions per 100 stops, stronger demonstrated duty-hour pace, and greater route familiarity. Pace never outranks pickup reliability or service quality.</footer>
                </section>
              ) : null}

              {profile && detail && driverEvidence.length === 0 ? (
                <section className={styles.driverEvidencePanel}>
                  <header className={styles.sectionHead}><div><p>Drivers with evidence on this route</p><h2>No primary-driver evidence</h2><span>The selected route has no roster-matched records with primary-driver duty-hour evidence in this contract block.</span></div></header>
                </section>
              ) : null}

              {profile ? (
                <section className={styles.recentPanel}>
                  <header className={styles.sectionHead}><div><p>Selected route record</p><h2>Recent operating days</h2><span>Driver is assignment context only; this is not a Driver Scorecard.</span></div></header>
                  <div className={styles.recentHead}><span>Date</span><span>Route</span><span>Assignment</span><span>Plan</span><span>Actual</span><span>Packages</span><span>PU stops</span><span>Completion</span><span>Band</span></div>
                  <div className={styles.recentRows}>{[...selectedRows].reverse().map((row: RouteCapacityRow) => <div key={`${row.service_date}:${row.route_key}`}><strong>{date(row.service_date, false)}</strong><span>{row.route_name || row.wa_number || "—"}</span><span>{row.driver_name || "—"}</span><span>{number(routeCapacityNumber(row.planned_delivery_stops))}</span><span>{number(routeCapacityNumber(row.actual_delivery_stops))}</span><span>{number(routeCapacityNumber(row.actual_delivery_packages))}</span><span>{number(routeCapacityNumber(row.actual_pickup_stops))}</span><span>{row.completion_ratio == null ? "—" : percent(routeCapacityNumber(row.completion_ratio))}</span><b className={row.baseline_band ? styles[`bandText${row.baseline_band}`] : styles.bandTextSupplemental}>{row.baseline_band ? bandLabels[row.baseline_band] : row.route_class === "SUPPLEMENTAL" ? "Supplemental" : row.route_class.toLowerCase()}</b></div>)}</div>
                </section>
              ) : null}

              <footer className={styles.sourceNote}>General analysis: shared FINAL DSW contract-day payload. Deep dive: one selected permanent route ID, with up to 182 prior days used only to establish that route’s comparison history. Driver fit: typed materialized route/day facts returned inside the same selected-route report.</footer>
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}
