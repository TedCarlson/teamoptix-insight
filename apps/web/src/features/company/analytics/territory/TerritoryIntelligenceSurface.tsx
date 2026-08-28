"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import {
  buildTerritoryModel,
  territoryWorkload,
  type TerritoryPayload,
  type TerritoryRow,
} from "./territoryIntelligence";
import { zipNumber } from "@/features/opportunity-analysis/zipIntelligence";
import TerritoryMap from "./TerritoryMap";
import styles from "./territory-intelligence.module.css";

const territoryCache = new Map<string, Promise<TerritoryPayload>>();
const territorySourceVersion = "5";

const format = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

function displayDate(value: string | null | undefined, year = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function displayMonth(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00Z`));
}

function loadTerritory(slug: string, startDate: string, endDate: string) {
  const key = `${territorySourceVersion}:${slug}:${startDate}:${endDate}`;
  let request = territoryCache.get(key);
  if (!request) {
    request = fetch(
      `/api/company/${slug}/analytics/territory?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&sourceVersion=${territorySourceVersion}`,
      { credentials: "include", cache: "no-store" },
    ).then(async (response) => {
      const body = (await response.json()) as TerritoryPayload;
      if (!response.ok) throw new Error(body.error ?? "Unable to build Territory Intelligence.");
      return body;
    });
    territoryCache.set(key, request);
  }
  return request;
}

function BandRows({ rows }: { rows: ReturnType<typeof buildTerritoryModel>["composition"] }) {
  const max = Math.max(1, ...rows.map((row) => row.workload));
  return (
    <div className={styles.bandRows}>
      {rows.map((row) => (
        <div key={row.key}>
          <span><strong>{row.label}</strong><small>{row.zipCount} ZIP{row.zipCount === 1 ? "" : "s"}</small></span>
          <i><b style={{ width: `${(row.workload / max) * 100}%` }} /></i>
          <span><strong>{format(row.workload)}</strong><small>{format(row.workloadShare * 100, 1)}% of stops</small></span>
        </div>
      ))}
    </div>
  );
}

function OutlierTable({
  rows,
}: {
  rows: ReturnType<typeof buildTerritoryModel>["outlierRows"];
}) {
  return (
    <div className={styles.outlierTable}>
      <div className={styles.outlierHead}>
        <span>ZIP / known place</span><span>Exception reason</span><span>Core distance</span><span>Stops</span><span>Packages</span><span>Observed</span>
      </div>
      {rows.map(({ row, coreDistanceMiles }) => (
        <div className={styles.outlierRow} key={row.zip_code}>
          <span><strong>{row.zip_code}</strong><small>{row.preferred_city ? `${row.preferred_city}, ${row.state_code}` : "Reference unmatched"}</small></span>
          <span><strong>Geographic outlier</strong><small>Outside core · immaterial workload share</small></span>
          <span>{format(coreDistanceMiles, 1)} mi</span>
          <span>{format(territoryWorkload(row))}</span>
          <span>{format(zipNumber(row.delivery_packages))}</span>
          <span>{displayDate(row.first_seen, false)} – {displayDate(row.last_seen, false)}</span>
        </div>
      ))}
    </div>
  );
}

function ZipTable({ rows, totalWorkload }: { rows: TerritoryRow[]; totalWorkload: number }) {
  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableHead}>
        <span>ZIP / known place</span><span>Context</span><span>Terminal</span><span>Days</span><span>Routes</span><span>Stops</span><span>Packages</span><span>Share</span><span>Known since</span>
      </div>
      <div className={styles.tableRows}>
        {rows.map((row) => {
          const workload = territoryWorkload(row);
          return (
            <div key={row.zip_code}>
              <span><strong>{row.zip_code}</strong><small>{row.preferred_city ? `${row.preferred_city}, ${row.state_code}` : "Reference unmatched"}</small></span>
              <span><strong>{row.ruca_category?.replaceAll("_", " ") ?? "Unclassified"}</strong><small>{row.classification?.replaceAll("_", " ") ?? "Unknown type"}</small></span>
              <span><strong>{row.terminal_distance_miles === null ? "—" : `${format(zipNumber(row.terminal_distance_miles), 1)} mi`}</strong><small>from terminal</small></span>
              <span>{format(zipNumber(row.operating_days))}</span>
              <span>{format(zipNumber(row.routes_observed))}</span>
              <span><strong>{format(workload)}</strong><small>{format(zipNumber(row.pickup_stops))} PU</small></span>
              <span>{format(zipNumber(row.delivery_packages))}</span>
              <span>{totalWorkload ? `${format((workload / totalWorkload) * 100, 1)}%` : "—"}</span>
              <span>{displayDate(row.first_seen, false)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TerritoryIntelligenceSurface({ slug }: { slug: string }) {
  const { payload: contract, payloadLoading: contractLoading, error: contractError, loadedYear } = useAnalyticsData();
  const [territoryState, setTerritoryState] = useState<{
    key: string | null;
    payload: TerritoryPayload | null;
    error: string | null;
  }>({ key: null, payload: null, error: null });
  const startDate = contract?.metadata.start_date ?? null;
  const endDate = contract?.metadata.end_date ?? null;
  const requestKey = startDate && endDate ? `${territorySourceVersion}:${slug}:${startDate}:${endDate}` : null;
  const loading = requestKey !== null && territoryState.key !== requestKey;
  const payload = territoryState.key === requestKey ? territoryState.payload : null;
  const error = territoryState.key === requestKey ? territoryState.error : null;

  useEffect(() => {
    if (!startDate || !endDate) return;
    let active = true;
    loadTerritory(slug, startDate, endDate)
      .then((result) => {
        if (active) setTerritoryState({ key: `${territorySourceVersion}:${slug}:${startDate}:${endDate}`, payload: result, error: null });
      })
      .catch((caught) => {
        if (!active) return;
        territoryCache.delete(`${territorySourceVersion}:${slug}:${startDate}:${endDate}`);
        setTerritoryState({
          key: `${territorySourceVersion}:${slug}:${startDate}:${endDate}`,
          payload: null,
          error: caught instanceof Error ? caught.message : "Unable to build Territory Intelligence.",
        });
      });
    return () => { active = false; };
  }, [endDate, slug, startDate]);

  const model = useMemo(() => buildTerritoryModel(payload?.rows ?? []), [payload]);
  const coverage = payload?.coverage;
  const zipCoverage = coverage && zipNumber(coverage.source_records) > 0
    ? zipNumber(coverage.records_with_zip) / zipNumber(coverage.source_records)
    : null;

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 36 }}>
        <article className={styles.report}>
          <header className={styles.hero}>
            <div><p>Analytics · Territory</p><h1>Territory Intelligence</h1><span>Known service geography derived from normalized manifest ZIP facts and the same demographic, rurality, and centroid references used by Opportunity Analysis.</span></div>
            <div className={styles.contractContext}><span>Shared analytics context</span><strong>Calendar year {loadedYear ?? "—"}</strong><small>{startDate && endDate ? `${displayDate(startDate)} – ${displayDate(endDate)}` : "Loading calendar range…"}</small><small>Report mode · sale-readiness foundation</small></div>
          </header>

          {contractLoading || loading ? <div className={styles.state}>Building the known territory record…</div> : null}
          {contractError || error ? <div className={`${styles.state} ${styles.error}`}><strong>Territory Intelligence unavailable.</strong><span>{contractError ?? error}</span></div> : null}

          {!contractLoading && !loading && !contractError && !error && payload ? (
            <>
              <section className={styles.summary}>
                <article><span>Known ZIPs</span><strong>{format(model.zipCount)}</strong><small>{model.coreZipCount} core · {model.outlierRows.length} exception{model.outlierRows.length === 1 ? "" : "s"}</small></article>
                <article><span>Manifest days</span><strong>{format(zipNumber(coverage?.manifest_days))}</strong><small>{displayDate(coverage?.manifest_start, false)} – {displayDate(coverage?.manifest_end, false)}</small></article>
                <article><span>Observed stops</span><strong>{format(model.totalWorkload)}</strong><small>{format(model.pickupStops)} pickup stops</small></article>
                <article><span>Delivery packages</span><strong>{format(model.deliveryPackages)}</strong><small>Known manifest volume</small></article>
                <article><span>Workload distance</span><strong>{model.weightedDistance === null ? "—" : `${format(model.weightedDistance, 1)} mi`}</strong><small>Stop-weighted centroid distance</small></article>
                <article className={styles.signalCard}><span>Rurality factor</span><strong>{model.workloadRurality === null ? "—" : format(model.workloadRurality, 2)}</strong><small>Observed workload weighting</small></article>
              </section>

              <div className={styles.coverageNotice}><strong>Known territory</strong><span>This report grows with normalized manifest history. It currently covers {format(zipNumber(coverage?.manifest_days))} manifest days inside the selected calendar range with {zipCoverage === null ? "no" : `${format(zipCoverage * 100, 1)}%`} ZIP attribution.</span></div>

              <section className={styles.mapPanel}>
                <header className={styles.sectionHead}><div><p>Observed service footprint</p><h2>Interactive ZIP dominance map</h2><span>Pan, zoom, or select a ZIP for detail. Larger ZIP labels indicate greater observed delivery-plus-pickup stop volume.</span></div><div className={styles.mapKey}><span><i className={styles.terminalMark} />Terminal</span><span><i className={styles.boundaryMark} />Census ZCTA boundary</span><span>Label color follows RUCA context</span></div></header>
                <TerritoryMap slug={slug} rows={model.mapRows} terminal={payload.terminal} />
                <footer><span>{payload.terminal.terminal_name ?? "Active terminal"}</span><strong>{payload.terminal.matched_address ?? payload.terminal.submitted_address ?? "Terminal address not configured"}</strong><small>Core territory only · Census ZCTA boundaries · centroid analysis, not driven route miles.</small></footer>
              </section>

              <section className={styles.twoColumn}>
                <article className={styles.panel}><header className={styles.sectionHead}><div><p>Settlement context</p><h2>Workload composition</h2><span>Metro-to-rural mix weighted by actual observed stops—not residential population.</span></div></header><BandRows rows={model.composition} /></article>
                <article className={styles.panel}><header className={styles.sectionHead}><div><p>Travel burden</p><h2>Distance from terminal</h2><span>Straight-line distance bands using the terminal and ZIP centroids.</span></div></header><BandRows rows={model.distance} /></article>
              </section>

              <section className={styles.buyerLens}>
                <article><span>Dominant ZIP</span><strong>{model.dominantZip?.zip_code ?? "—"}</strong><small>{model.dominantZip ? `${format((territoryWorkload(model.dominantZip) / Math.max(model.totalWorkload, 1)) * 100, 1)}% of known stops` : "No manifest evidence"}</small></article>
                <article><span>Known population</span><strong>{format(model.residential.population)}</strong><small>Residential/mappable ZIP references</small></article>
                <article><span>People / sq mi</span><strong>{model.residential.residentialDensity === null ? "—" : format(model.residential.residentialDensity)}</strong><small>Combined known residential density</small></article>
                <article><span>Business establishments</span><strong>{format(model.residential.establishments)}</strong><small>Census business reference</small></article>
              </section>

              <section className={styles.ledger}>
                <header className={styles.sectionHead}><div><p>Territory evidence ledger</p><h2>Core ZIP operating record</h2><span>Sorted by observed stop dominance. Recipient and street address fields are not requested by this report.</span></div><div className={styles.coverageRange}><span>Core coverage</span><strong>{model.coreZipCount} of {model.zipCount} ZIPs</strong></div></header>
                {model.rows.length ? <ZipTable rows={model.rows} totalWorkload={model.totalWorkload} /> : <div className={styles.empty}>No normalized manifest ZIP facts fall inside this contract period yet.</div>}
              </section>

              {model.expansion.length ? <section className={styles.expansion}><header className={styles.sectionHead}><div><p>Evidence growth</p><h2>Known footprint emergence</h2><span>The first month each ZIP appears in retained manifest evidence. This reflects collection maturity as well as operating expansion.</span></div></header><div>{model.expansion.map((item) => <article key={item.month}><span>{displayMonth(item.month)}</span><strong>+{item.zipCount} ZIP{item.zipCount === 1 ? "" : "s"}</strong><small>{format(item.workload)} currently observed stops</small></article>)}</div></section> : null}

              {model.outlierRows.length ? (
                <section className={styles.outliers}>
                  <header className={styles.sectionHead}><div><p>Geographic evidence exceptions</p><h2>Outliers excluded from territory map</h2><span>These records remain visible for adjudication but do not distort the core map, distance bands, or buyer-facing territory profile.</span></div><div className={styles.coverageRange}><span>Exception rule</span><strong>Distant + under 1% workload</strong></div></header>
                  <OutlierTable rows={model.outlierRows} />
                </section>
              ) : null}

              <footer className={styles.methodology}>Source: normalized delivery and pickup manifest facts within the shared contract dates. ZIP enrichment uses HUD/vendor centroids, Census/ACS population and land area, Census ZIP Code Business Patterns, and USDA ERS RUCA. Map labels use the core geographic field; a ZIP is classified as an exception only when it is far outside the workload-weighted core and represents less than 1% of observed workload. Terminal distance is straight-line centroid distance and does not represent driven route miles. Report mode presents known evidence only; no valuation conclusion is applied.</footer>
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}
