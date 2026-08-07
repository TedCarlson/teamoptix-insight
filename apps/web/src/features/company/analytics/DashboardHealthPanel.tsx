import Link from "next/link";
import type {
  DashboardExpressContext,
  DashboardHealth,
  DashboardHealthStatus,
} from "./dashboardHealth";
import styles from "./dashboard-health.module.css";

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

function change(value: number | null, suffix = "") {
  if (value == null) return "Baseline emerging";
  if (Math.abs(value) < 0.05) return `Flat${suffix}`;
  return `${value > 0 ? "+" : ""}${number(value, 1)}${suffix}`;
}

function statusLabel(status: DashboardHealthStatus) {
  if (status === "critical") return "Critical";
  if (status === "watch") return "Watch";
  if (status === "healthy") return "Healthy";
  return "Coverage growing";
}

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function pressureChange(stops: number | null, packages: number | null) {
  const known = [stops, packages].filter((value): value is number => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function pressureLabel(value: number | null) {
  if (value == null) return "Baseline emerging";
  if (value >= 5) return "Ramping";
  if (value <= -5) return "Cooling";
  return "Aligned";
}

function serviceLabel(
  tier: string | null,
  codeChange: number | null,
  ilsChange: number | null
) {
  if (tier === "T1" || (codeChange != null && codeChange >= 25) || (ilsChange != null && ilsChange <= -1)) return "Attention";
  if (tier === "T2" || tier === "T3" || (codeChange != null && codeChange >= 10) || (ilsChange != null && ilsChange <= -0.35)) return "Watch";
  return "Stable";
}

export default function DashboardHealthPanel({
  health,
  express,
  slug,
}: {
  health: DashboardHealth;
  express: DashboardExpressContext | null;
  slug: string;
}) {
  const { recent, changes, workforce, weekend } = health;
  const completeProfiles = [
    { key: "weekday", label: "Weekday", detail: "Monday–Friday", metrics: recent, changes },
    { key: "weekend", label: "Weekend", detail: "Saturday–Sunday", metrics: weekend.recent, changes: weekend.changes },
  ];
  const currentDaySignals = health.currentWeek?.days.map((day) => {
    const demandChange = pressureChange(
      day.changes?.stopsPerDay ?? null,
      day.changes?.packagesPerDay ?? null
    );
    const service = day.current
      ? serviceLabel(
          day.current.pickupTier,
          day.changes?.serviceCodeRate ?? null,
          day.changes?.ilsPoints ?? null
        )
      : null;
    return { ...day, demandChange, service };
  }) ?? [];
  const outlierSignals = currentDaySignals
    .filter((day) => day.current && (Math.abs(day.demandChange ?? 0) >= 15 || day.service === "Attention"))
    .map((day) => `${weekdayNames[day.weekday]} ${day.demandChange != null && Math.abs(day.demandChange) >= 15 ? pressureLabel(day.demandChange).toLowerCase() : "service attention"}`);
  const nextRouteReadyNotice = workforce.noticeResignations.find(
    (notice) => notice.route_ready_departure
  );

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p>Operating health + suggested action</p>
          <h2>Management game plan</h2>
          <span>
            Five complete operating weeks connect demand, deployed routes, workforce
            depth, and service results. Monday–Friday and weekend work are evaluated separately.
          </span>
        </div>
        <div className={`${styles.verdict} ${styles[health.status]}`}>
          <small>Overall operating health</small>
          <strong>{health.label}</strong>
          <span>{health.summary}</span>
        </div>
      </header>

      <section className={styles.profileMatrix} aria-label="Weekday and weekend operating profiles">
        <header>
          <span>Profile</span>
          <span>Demand</span>
          <span>Route deployment</span>
          <span>Service result</span>
          <span>Pickup reliability</span>
        </header>
        {completeProfiles.map((profile) => {
          const { metrics, changes: profileChanges } = profile;
          return (
            <article key={profile.key}>
              <div className={styles.profileName}>
                <strong>{profile.label}</strong>
                <small>{profile.detail} · 5-week average</small>
              </div>
              <div>
                <strong>{number(metrics.deliveryStopsPerDay)} stops/day</strong>
                <b>{number(metrics.deliveryPackagesPerDay)} packages/day</b>
                <small>Stops {change(profileChanges.stopsPerDay, "%")} · packages {change(profileChanges.packagesPerDay, "%")}</small>
              </div>
              <div>
                <strong>{number(metrics.routesPerDay, 1)} routes/day</strong>
                <b>{number(metrics.deliveryStopsPerRoute, 1)} stops · {number(metrics.deliveryPackagesPerRoute, 1)} packages / route</b>
                <small>Routes {change(profileChanges.routesPerDay, "%")} · load {change(Math.max(profileChanges.stopsPerRoute ?? 0, profileChanges.packagesPerRoute ?? 0), "%")}</small>
              </div>
              <div>
                <strong>{metrics.serviceCodesPerThousandPackages == null ? "Codes unavailable" : `${number(metrics.serviceCodesPerThousandPackages, 2)} codes / 1k`}</strong>
                <b>{metrics.ilsPercent == null ? "ILS unavailable" : `${number(metrics.ilsPercent, 2)}% ILS`}</b>
                <small>Codes {change(profileChanges.serviceCodeRate, "%")} vs prior</small>
              </div>
              <div>
                <strong>{metrics.pickupTier ?? "PRI —"}{metrics.pickupPri == null ? "" : ` · ${number(metrics.pickupPri, 3)}`}</strong>
                <b>E / L / M {number(metrics.earlyPickups)} / {number(metrics.latePickups)} / {number(metrics.potentialMissedPickups)}</b>
                <small>{number(metrics.pickupStops)} PU stops</small>
              </div>
            </article>
          );
        })}
      </section>

      <div className={`${styles.capacityBand} ${workforce.routeReadyDepartures > 0 ? styles.capacityAtRisk : ""}`}>
        <span>People capacity</span>
        <strong>{number(workforce.activeDrivers)} Active · {number(workforce.routeReadyDepartures)} on notice</strong>
        <b>{number(workforce.fiveDayTarget)} sustainable target</b>
        <em>{number(workforce.projectedReadinessPercent)}% projected</em>
        <small>
          {workforce.routeReadyDepartures > 0
            ? `${number(workforce.projectedActiveDrivers)} route-ready after notice · next last day in ${number(nextRouteReadyNotice?.days_until_last_day ?? 0)} days`
            : `${number(workforce.firstNinetyDayDrivers)} inside first 90 days · ${number(workforce.trainees)} trainee${workforce.trainees === 1 ? "" : "s"}`}
        </small>
      </div>

      {health.currentWeek ? (
        <section className={styles.currentPulse}>
          <header>
            <div>
              <span>Current-week pulse</span>
              <strong>Elapsed days compared like for like</strong>
            </div>
            <small>Through {health.currentWeek.through}</small>
          </header>
          <div className={styles.weekMatrix}>
            <div className={styles.weekMatrixHeader}>
              <span />
              {currentDaySignals.map((day) => (
                <span key={day.serviceDate}>
                  <strong>{weekdayNames[day.weekday]}</strong>
                  <small>{shortDate(day.serviceDate)}</small>
                </span>
              ))}
            </div>
            <div className={styles.weekMatrixRow}>
              <div className={styles.weekMatrixLabel}>
                <strong>Demand pressure</strong>
                <small>Current vs same weekday · prior 5 weeks</small>
              </div>
              {currentDaySignals.map((day) => (
                <div key={day.serviceDate}>
                  {day.current ? (
                    <>
                      <strong className={day.demandChange != null && Math.abs(day.demandChange) >= 15 ? styles.outlier : undefined}>
                        {pressureLabel(day.demandChange)} {change(day.demandChange, "%")}
                      </strong>
                      <b>{number(day.current.routesPerDay, 1)} routes · {number(day.current.deliveryStopsPerDay)} stops</b>
                      <small>{number(day.current.deliveryPackagesPerDay)} packages</small>
                    </>
                  ) : (
                    <>
                      <strong className={styles.pendingSignal}>
                        {day.elapsed ? "Current not reported" : "Current pending"}
                      </strong>
                      {day.baseline ? (
                        <>
                          <b>5-week norm · {number(day.baseline.routesPerDay, 1)} routes · {number(day.baseline.deliveryStopsPerDay)} stops</b>
                          <small>{number(day.baseline.deliveryPackagesPerDay)} packages</small>
                        </>
                      ) : (
                        <small>No prior sample</small>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.weekMatrixRow}>
              <div className={styles.weekMatrixLabel}>
                <strong>Service health</strong>
                <small>Codes, ILS, and period PRI</small>
              </div>
              {currentDaySignals.map((day) => (
                <div key={day.serviceDate}>
                  {day.current ? (
                    <>
                      <strong className={day.service === "Attention" ? styles.outlier : undefined}>{day.service}</strong>
                      <b>{day.current.serviceCodesPerThousandPackages == null ? "Codes —" : `${number(day.current.serviceCodesPerThousandPackages, 1)} codes/1k`} · {day.current.ilsPercent == null ? "ILS —" : `${number(day.current.ilsPercent, 1)}% ILS`}</b>
                      <small>{day.current.pickupTier ?? "PRI —"}{day.current.pickupPri == null ? "" : ` ${number(day.current.pickupPri, 3)}`} · E/L/M {number(day.current.earlyPickups)}/{number(day.current.latePickups)}/{number(day.current.potentialMissedPickups)}</small>
                    </>
                  ) : (
                    <>
                      <strong className={styles.pendingSignal}>
                        {day.elapsed ? "Current not reported" : "Current pending"}
                      </strong>
                      {day.baseline ? (
                        <>
                          <b>
                            5-week norm · {day.baseline.serviceCodesPerThousandPackages == null
                              ? "Codes —"
                              : `${number(day.baseline.serviceCodesPerThousandPackages, 1)} codes/1k`} · {day.baseline.ilsPercent == null
                              ? "ILS —"
                              : `${number(day.baseline.ilsPercent, 1)}% ILS`}
                          </b>
                          <small>
                            {day.baseline.pickupTier ?? "PRI —"}{day.baseline.pickupPri == null ? "" : ` ${number(day.baseline.pickupPri, 3)}`} · E/L/M {number(day.baseline.earlyPickups)}/{number(day.baseline.latePickups)}/{number(day.baseline.potentialMissedPickups)}
                          </small>
                        </>
                      ) : (
                        <small>No prior sample</small>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <footer>
            <strong>Week signal:</strong> {outlierSignals.length ? `Outlier behavior is visible on ${outlierSignals.join(", ")}.` : "No material day-of-week outlier is visible in the elapsed FINAL record."}
          </footer>
        </section>
      ) : null}

      <div className={styles.evidenceStrip}>
        <div>
          <span>Route composition signal</span>
          <strong>
            {health.routeComposition.additionalRouteEquivalent > 0
              ? `+${health.routeComposition.additionalRouteEquivalent} route equivalent`
              : "Current deployment aligned"}
          </strong>
          <small>Needed to restore the prior five-week stops/packages-per-route shape</small>
        </div>
        <div>
          <span>Express pressure</span>
          <strong>
            {!express?.available
              ? "Manifest coverage emerging"
              : express.open_packages > 0
                ? `${number(express.open_packages)} open packages`
                : Number(express.attempted_packages ?? 0) > 0
                  ? `${number(Number(express.attempted_packages ?? 0))} attempted packages`
                  : "No open package signal"}
          </strong>
          <small>
            {express?.available
              ? `${number(Number(express.complete_packages ?? 0))} Complete · ${number(Number(express.attempted_packages ?? 0))} Attempted · ${number(express.open_packages)} Open · ${number(express.coverage_days)} days`
              : "Express is manifest-derived and is not inferred from DSW"}
          </small>
        </div>
        <div>
          <span>Analysis window</span>
          <strong>{recent.weeks} complete weeks</strong>
          <small>{recent.start ?? "—"} through {recent.end ?? "—"} · partial current week excluded</small>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.actionIntro}>
          <p>Suggested action</p>
          <h3>What management should do next</h3>
          <span>Suggestions are rules-based and show the evidence used. They do not assign individual fault.</span>
        </div>
        <ol>
          {health.suggestions.map((suggestion) => (
            <li key={suggestion.key} className={styles[suggestion.level]}>
              <div>
                <span>{statusLabel(suggestion.level)}</span>
                <strong>{suggestion.title}</strong>
                <p>{suggestion.detail}</p>
              </div>
              {suggestion.key === "routes" || suggestion.key === "service" ? (
                <Link href={`/company/${slug}/analytics/routes`}>Open Route Intelligence</Link>
              ) : suggestion.key === "workforce" || suggestion.key === "off_ramp" || suggestion.key === "tenure" ? (
                <Link href={`/company/${slug}/analytics/workforce`}>Open Workforce</Link>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <footer className={styles.method}>
        <strong>How this is judged:</strong> Monday–Friday demand is compared only with prior Monday–Friday work; Saturday–Sunday volume and service are evaluated independently. Staffing uses the combined weekly route-days from both profiles with a 12.5% reserve. PRI is recomputed for each period from total pickup stops and E/L/M events, with null DSW exception fields treated as zero. The partial current week is excluded.
      </footer>
    </section>
  );
}
