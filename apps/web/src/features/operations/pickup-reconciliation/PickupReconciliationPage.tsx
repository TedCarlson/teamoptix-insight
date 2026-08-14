"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./pickup-reconciliation.module.css";

type HistoryRow = {
  service_date: string;
  actual_pickup_stops?: number | string | null;
  early_pickups?: number | string | null;
  late_pickups?: number | string | null;
  potential_missed_pickups?: number | string | null;
  pickup_reliability_complete?: boolean | null;
};

type ContractOption = {
  operating_year: number | string;
};

type HistoryPayload = {
  contract?: {
    contract_number?: string | null;
    effective_start_date?: string | null;
    effective_end_date?: string | null;
    operating_year?: number | null;
  } | null;
  metadata?: {
    requested_year?: number;
    start_date?: string;
    end_date?: string;
    through_service_date?: string | null;
  } | null;
  rows?: HistoryRow[];
  error?: string;
};

type ReconciliationDay = {
  date: string;
  pickupStops: number;
  early: number;
  late: number;
  potential: number;
  complete: boolean;
};

type ReconciliationWeek = {
  weekStart: string;
  weekEnd: string;
  pickupStops: number;
  early: number;
  late: number;
  potential: number;
  flaggedDays: number;
  complete: boolean;
  provisionalPri: number | null;
  days: ReconciliationDay[];
};

type EvidenceRoute = {
  key: string;
  route_label: string;
  route_name?: string | null;
  wa_number?: string | null;
  driver_name: string | null;
  roster_id: string | null;
  roster_name: string | null;
  route_baseline_id?: string | null;
  early_pickups: number;
  late_pickups: number;
  potential_missed_pickups: number;
  source: string | null;
  source_id: string | null;
};

type EvidencePayload = {
  service_date?: string;
  routes?: EvidenceRoute[];
  error?: string;
};

type RouteCase = EvidenceRoute & { serviceDate: string };

const n = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfOperatingWeek(value: string) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
  return isoDate(date);
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

function pri(value: number | null) {
  return value == null ? "—" : value.toFixed(3);
}

function buildWeeks(rows: HistoryRow[]): ReconciliationWeek[] {
  const byWeek = new Map<string, ReconciliationDay[]>();

  for (const row of rows) {
    const day: ReconciliationDay = {
      date: row.service_date.slice(0, 10),
      pickupStops: n(row.actual_pickup_stops),
      early: n(row.early_pickups),
      late: n(row.late_pickups),
      potential: n(row.potential_missed_pickups),
      complete: row.pickup_reliability_complete === true,
    };
    const key = startOfOperatingWeek(day.date);
    byWeek.set(key, [...(byWeek.get(key) ?? []), day]);
  }

  return [...byWeek.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, days]) => {
      const pickupStops = days.reduce((sum, day) => sum + day.pickupStops, 0);
      const early = days.reduce((sum, day) => sum + day.early, 0);
      const late = days.reduce((sum, day) => sum + day.late, 0);
      const potential = days.reduce((sum, day) => sum + day.potential, 0);
      const complete = days.every((day) => day.complete);
      const numerator = early * 225 + late * 150 + potential * 400;

      return {
        weekStart,
        weekEnd: addDays(weekStart, 6),
        pickupStops,
        early,
        late,
        potential,
        flaggedDays: days.filter((day) => day.early > 0 || day.late > 0 || day.potential > 0).length,
        complete,
        provisionalPri:
          complete && pickupStops > 0 ? numerator / pickupStops : null,
        days: [...days].sort((left, right) => left.date.localeCompare(right.date)),
      };
    })
    .filter((week) => week.early > 0 || week.late > 0 || week.potential > 0);
}

export default function PickupReconciliationPage({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWeekStart, setActiveWeekStart] = useState<string | null>(null);
  const [evidenceByDate, setEvidenceByDate] = useState<Record<string, EvidenceRoute[]>>({});
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const optionsResponse = await fetch(
          `/api/company/${slug}/analytics/history`,
          { credentials: "include", cache: "no-store" }
        );
        const optionsResult = await optionsResponse.json();

        if (!optionsResponse.ok) {
          throw new Error(optionsResult?.error ?? "Unable to load the contract context.");
        }

        const operatingYear = (Array.isArray(optionsResult?.available_years)
          ? (optionsResult.available_years as ContractOption[])
          : [])
          .map((option) => Number(option.operating_year))
          .filter((value) => Number.isInteger(value))
          .sort((left, right) => right - left)
          .at(0);

        if (!operatingYear) {
          throw new Error("No active contract operating year is available.");
        }

        const historyResponse = await fetch(
          `/api/company/${slug}/analytics/history?year=${operatingYear}`,
          { credentials: "include", cache: "no-store" }
        );
        const historyResult = (await historyResponse.json()) as HistoryPayload;

        if (!historyResponse.ok) {
          throw new Error(historyResult?.error ?? "Unable to load pickup history.");
        }

        if (active) setPayload(historyResult);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load PU reconciliation.");
          setPayload(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  const weeks = useMemo(() => buildWeeks(payload?.rows ?? []), [payload]);
  const activeWeek =
    weeks.find((week) => week.weekStart === activeWeekStart) ?? weeks[0] ?? null;
  const potential = weeks.reduce((sum, week) => sum + week.potential, 0);
  const early = weeks.reduce((sum, week) => sum + week.early, 0);
  const late = weeks.reduce((sum, week) => sum + week.late, 0);
  const flaggedDays = weeks.reduce((sum, week) => sum + week.flaggedDays, 0);
  const routeCases = useMemo<RouteCase[]>(() => {
    if (!activeWeek) return [];

    return activeWeek.days.flatMap((day) =>
      (evidenceByDate[day.date] ?? [])
        .filter((route) => n(route.early_pickups) > 0 || n(route.late_pickups) > 0 || n(route.potential_missed_pickups) > 0)
        .map((route) => ({ ...route, serviceDate: day.date }))
    );
  }, [activeWeek, evidenceByDate]);

  useEffect(() => {
    const dates = activeWeek?.days
      .filter((day) => day.early > 0 || day.late > 0 || day.potential > 0)
      .map((day) => day.date) ?? [];

    if (!dates.length) {
      setEvidenceByDate({});
      setEvidenceError(null);
      setEvidenceLoading(false);
      return;
    }

    let active = true;
    setEvidenceLoading(true);
    setEvidenceError(null);

    Promise.all(
      dates.map(async (date) => {
        const response = await fetch(
          `/api/company/${slug}/people/corrective-actions/evidence?date=${encodeURIComponent(date)}`,
          { credentials: "include", cache: "no-store" }
        );
        const body = (await response.json()) as EvidencePayload;
        if (!response.ok) {
          throw new Error(body.error ?? `Unable to resolve route evidence for ${date}.`);
        }
        return [date, Array.isArray(body.routes) ? body.routes : []] as const;
      })
    )
      .then((entries) => {
        if (active) setEvidenceByDate(Object.fromEntries(entries));
      })
      .catch((caught) => {
        if (!active) return;
        setEvidenceByDate({});
        setEvidenceError(
          caught instanceof Error ? caught.message : "Unable to resolve the DSW route evidence."
        );
      })
      .finally(() => {
        if (active) setEvidenceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeWeek, slug]);

  return (
    <main className={`${styles.page} operations-pickup-page`}>
      <header className={styles.hero}>
        <div>
          <p>Operations · Pickup integrity</p>
          <h1>PU Reconciliation</h1>
          <span>
            Establish Early, Late, and Missed ownership from the DSW route record, then adjudicate Potential Missed outcomes.
          </span>
        </div>
        <div className={styles.contractContext}>
          <span>Shared contract context</span>
          <strong>Contract year {payload?.metadata?.requested_year ?? "—"}</strong>
          <small>
            {payload?.metadata?.start_date && payload?.metadata?.end_date
              ? `${shortDate(payload.metadata.start_date)} – ${shortDate(payload.metadata.end_date)}`
              : "Loading contract block…"}
          </small>
        </div>
      </header>

      {loading ? <div className={styles.state}>Reading the contract pickup record…</div> : null}
      {error ? <div className={`${styles.state} ${styles.error}`}><strong>PU Reconciliation unavailable.</strong><span>{error}</span></div> : null}

      {!loading && !error ? (
        <>
          <section className={styles.summary}>
            <article><span>Early pickups</span><strong>{number(early)}</strong><small>Owned by recorded driver + route</small></article>
            <article><span>Late pickups</span><strong>{number(late)}</strong><small>Owned by recorded driver + route</small></article>
            <article><span>Potential missed</span><strong>{number(potential)}</strong><small>Requires outcome adjudication</small></article>
            <article className={styles.mutedCard}><span>Verified missed</span><strong>—</strong><small>Adjudication ledger pending</small></article>
          </section>

          <section className={styles.workspace}>
            <div className={styles.queue}>
              <header>
                <div><p>Ownership + reconciliation queue</p><h2>Pickup reliability weeks</h2></div>
                <span>{number(weeks.length)} weeks · {number(flaggedDays)} exception days</span>
              </header>
              <div className={styles.columnHead}>
                <span>Operating week</span><span>Pickup stops</span><span>Pickup events</span><span>Provisional PRI</span><span>Status</span>
              </div>
              <div className={styles.rows}>
                {weeks.map((week) => (
                  <button
                    type="button"
                    key={week.weekStart}
                    className={activeWeek?.weekStart === week.weekStart ? styles.activeRow : ""}
                    onClick={() => setActiveWeekStart(week.weekStart)}
                  >
                    <span><strong>{shortDate(week.weekStart)}–{shortDate(week.weekEnd)}</strong><small>{week.flaggedDays} exception {week.flaggedDays === 1 ? "day" : "days"}</small></span>
                    <span>{number(week.pickupStops)}</span>
                    <span className={styles.signalCounts}>E {number(week.early)} · L {number(week.late)} · P {number(week.potential)}</span>
                    <span>{pri(week.provisionalPri)}</span>
                    <span className={week.potential > 0 ? styles.pending : styles.attributed}>{week.potential > 0 ? "Pending" : "Attributed"}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className={styles.rail}>
              {activeWeek ? (
                <>
                  <header><p>Selected operating week</p><h2>{shortDate(activeWeek.weekStart)}–{shortDate(activeWeek.weekEnd)}</h2><span>Saturday–Friday</span></header>
                  <div className={styles.railMetrics}>
                    <div><span>Early / Late</span><strong>{number(activeWeek.early)} / {number(activeWeek.late)}</strong></div>
                    <div><span>Pickup stops</span><strong>{number(activeWeek.pickupStops)}</strong></div>
                    <div><span>Potential missed</span><strong>{number(activeWeek.potential)}</strong></div>
                    <div><span>Provisional PRI</span><strong>{pri(activeWeek.provisionalPri)}</strong></div>
                  </div>
                  <section className={styles.caseList}>
                    <div className={styles.caseListHead}>
                      <div><span>Connected route evidence</span><strong>Driver + route cases</strong></div>
                      {!evidenceLoading && !evidenceError ? <b>{routeCases.length}</b> : null}
                    </div>
                    {evidenceLoading ? <p className={styles.evidenceState}>Resolving DSW route rows…</p> : null}
                    {evidenceError ? <p className={`${styles.evidenceState} ${styles.evidenceError}`}>{evidenceError}</p> : null}
                    {!evidenceLoading && !evidenceError && routeCases.length === 0 ? (
                      <p className={styles.evidenceState}>No route-level pickup reliability record was resolved for this week.</p>
                    ) : null}
                    {!evidenceLoading && !evidenceError ? routeCases.map((route) => (
                      <article className={styles.routeCase} key={`${route.serviceDate}:${route.key}`}>
                        <div className={styles.routeCaseTop}>
                          <span><strong>{longDate(route.serviceDate)}</strong><small>{route.source === "DSW_FINAL" ? "Final DSW" : "DSW source"}</small></span>
                          <div className={styles.routeSignals}>
                            <b className={styles.earlySignal}>E {number(n(route.early_pickups))}</b>
                            <b className={styles.lateSignal}>L {number(n(route.late_pickups))}</b>
                            <b className={styles.potentialSignal}>P {number(n(route.potential_missed_pickups))}</b>
                          </div>
                        </div>
                        <div className={styles.personRoute}>
                          <strong>{route.roster_name ?? route.driver_name ?? "Driver not recorded"}</strong>
                          <span>{route.route_label}</span>
                          <small>{route.roster_id ? "Roster identity connected" : "Roster match required"}</small>
                        </div>
                        <div className={styles.evidenceChain} aria-label="Evidence connection">
                          <span className={styles.chainSource}>DSW row</span><i>→</i><span>Reconcile</span><i>→</i><span className={styles.chainHeld}>CAN</span>
                        </div>
                        <div className={styles.sourceReference}>
                          <span>Source record</span>
                          <code>{route.source_id ? route.source_id.slice(0, 8) : "Unavailable"}</code>
                        </div>
                        <p>{route.roster_id ? "Early and Late ownership is established now. A Potential Missed result reaches the driver scorecard and CAN only after verification." : "Connect this driver to the roster before pickup ownership can reach scorecards or CAN."}</p>
                      </article>
                    )) : null}
                  </section>
                  <section className={styles.adjudicationPreview}>
                    <span>Adjudication record</span>
                    <strong>Pending visual acceptance</strong>
                    <p>Verified, cleared, and unresolved counts will be written here without altering the source Potential Missed evidence. Only verified, driver-attributed misses continue to scorecards and CAN.</p>
                  </section>
                </>
              ) : <div className={styles.empty}>No potential pickup weeks were found in this contract block.</div>}
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
