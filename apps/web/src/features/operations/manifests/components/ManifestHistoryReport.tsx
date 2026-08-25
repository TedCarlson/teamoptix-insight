"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  Printer,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { manifestHistoryWindow } from "@/features/operations/manifests/manifestHistory";
import styles from "./ManifestHistoryReport.module.css";

type RouteSummary = {
  route_key: string;
  route_label: string | null;
  route_status: string;
  manifest_normalization_status: string;
  delivery_stop_count: number | null;
  completed_delivery_stop_count: number | null;
  incomplete_delivery_stop_count: number | null;
  delivery_package_count: number | null;
  delivery_artifact_status: string | null;
  latest_captured_at: string | null;
  latest_processed_at: string | null;
  driver_name: string | null;
  last_delivery_time: string | null;
  last_delivery_address: string | null;
  last_delivery_postal_code?: string | null;
  last_delivery_at_local: string | null;
  last_pickup_time: string | null;
  last_transmission_time: string | null;
  final_stop_time: string | null;
  deliveries_complete: boolean;
  manifest_available: boolean;
  route_source: "FCC" | "MANIFEST" | "RETAINED_FACT" | "CLUSTER_FACT";
};

type RouteStopCluster = {
  route_key: string;
  route_label: string;
  cluster_key: string;
  postal_code_5: string | null;
  centroid_latitude: number | null;
  centroid_longitude: number | null;
  stop_count: number;
  delivery_stop_count: number;
  pickup_stop_count: number;
  completed_stop_count: number;
  package_count: number;
  standard_delivery_stop_count: number;
  express_stop_count: number;
  signature_stop_count: number;
  hazmat_stop_count: number;
  residential_stop_count: number;
  collection_stop_count: number;
  first_stop_sequence: number | null;
  last_stop_sequence: number | null;
  suppressed_location_count: number;
  is_location_suppressed: boolean;
};

type DeliveryStop = {
  id: string;
  st_number: string | null;
  sid: string | null;
  recipient: string | null;
  contact_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  delivery_time_begin: string | null;
  delivery_time_end: string | null;
  package_count: number | null;
  stop_instructions: string | null;
  completed: string | null;
  is_last_delivery?: boolean;
  delivery_observed_at_local?: string | null;
  package_summary: {
    count: number;
    express: number;
    signature: number;
    hazmat: number;
    residential: number;
    collection: number;
  };
};

type HistoryPayload = {
  retention?: { minimum: string; maximum: string; detail_minimum?: string };
  service_date?: string;
  retention_mode?: "IDENTIFIABLE" | "DEIDENTIFIED";
  routes?: RouteSummary[];
  selected_route?: RouteSummary | null;
  last_delivery_stop?: (DeliveryStop & {
    match_basis: "FCC_ADDRESS" | "COMPLETED_ROUTE_SEQUENCE" | null;
  }) | null;
  delivery_stops?: DeliveryStop[];
  stop_clusters?: RouteStopCluster[];
  error?: string;
};

type CalendarStatus = "final" | "in_day" | "inactive" | "empty";

type CalendarDay = {
  service_date: string;
  status: CalendarStatus;
};

function monthStart(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

function addMonths(dateIso: string, months: number) {
  const date = new Date(`${monthStart(dateIso)}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function monthLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart(dateIso)}T12:00:00.000Z`));
}

function calendarCells(monthIso: string) {
  const first = new Date(`${monthStart(monthIso)}T12:00:00.000Z`);
  const startOffset = (first.getUTCDay() + 1) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function dayLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function fullDate(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function routeName(route: RouteSummary) {
  return route.route_label?.trim() || route.route_key;
}

function address(stop: DeliveryStop) {
  return stop.postal_code ? `ZIP ${stop.postal_code.slice(0, 5)}` : "ZIP unavailable";
}

function statusComplete(value: string | null) {
  return ["Y", "YES", "COMPLETE", "COMPLETED"].includes(
    String(value ?? "").trim().toUpperCase()
  );
}

function stopOrder(value: string | null) {
  const parsed = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function formatClock(value: string | null) {
  if (!value) return "Not reported";
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return value;
  const timestamp = new Date(
    `2000-01-01T${match[1].padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`
  );
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: match[3] ? "2-digit" : undefined,
  }).format(timestamp);
}

function formatObservedTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const [date, time] = value.split("T");
  return time ? `${dayLabel(date)} · ${formatClock(time)}` : value;
}

export default function ManifestHistoryReport({ slug }: { slug: string }) {
  const initialWindow = useMemo(() => manifestHistoryWindow(), []);
  const [serviceDate, setServiceDate] = useState(initialWindow.maximum);
  const [visibleMonth, setVisibleMonth] = useState(
    monthStart(initialWindow.maximum)
  );
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [routeKey, setRouteKey] = useState("");
  const [payload, setPayload] = useState<HistoryPayload>({ routes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const visibleCalendarCells = useMemo(
    () => calendarCells(visibleMonth),
    [visibleMonth]
  );
  const calendarMap = useMemo(
    () => new Map(calendarDays.map((day) => [day.service_date, day.status])),
    [calendarDays]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadCalendar() {
      const params = new URLSearchParams({
        startDate: visibleCalendarCells[0],
        endDate: visibleCalendarCells[visibleCalendarCells.length - 1],
      });

      try {
        const response = await fetch(
          `/api/company/${slug}/operations/reports/daily-operations-calendar?${params.toString()}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const data = (await response.json().catch(() => ({}))) as {
          days?: CalendarDay[];
        };
        if (!response.ok) throw new Error("Unable to load production dates.");
        setCalendarDays(Array.isArray(data.days) ? data.days : []);
      } catch {
        if (!controller.signal.aborted) setCalendarDays([]);
      }
    }

    void loadCalendar();
    return () => controller.abort();
  }, [slug, visibleCalendarCells]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ date: serviceDate });
        if (routeKey) params.set("routeKey", routeKey);
        const response = await fetch(
          `/api/company/${slug}/operations/manifests/history?${params.toString()}`,
          { credentials: "include", cache: "no-store", signal: controller.signal }
        );
        const data = (await response.json().catch(() => ({}))) as HistoryPayload;
        if (!response.ok) throw new Error(data.error || "Unable to load manifest history.");
        if (data.service_date && data.service_date !== serviceDate) return;
        setPayload(data);
        if (!routeKey && data.selected_route?.route_key) {
          setRouteKey(data.selected_route.route_key);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load manifest history."
        );
        setPayload({ routes: [], delivery_stops: [] });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [refreshToken, routeKey, serviceDate, slug]);

  useEffect(() => {
    if (serviceDate !== initialWindow.maximum) return;
    const timer = window.setInterval(
      () => setRefreshToken((current) => current + 1),
      30_000
    );
    return () => window.clearInterval(timer);
  }, [initialWindow.maximum, serviceDate]);

  const routes = payload.routes ?? [];
  const fullManifestCount = routes.filter(
    (route) => route.manifest_available
  ).length;
  const selected = payload.selected_route ?? null;
  const lastDeliveryStop = payload.last_delivery_stop ?? null;
  const isDeidentified = payload.retention_mode === "DEIDENTIFIED";
  const stops = useMemo(
    () =>
      [...(payload.delivery_stops ?? [])].sort(
        (left, right) => stopOrder(left.st_number) - stopOrder(right.st_number)
      ),
    [payload.delivery_stops]
  );
  const clusters = payload.stop_clusters ?? [];

  function chooseDate(date: string) {
    if (!date) return;
    setServiceDate(date);
    setVisibleMonth(monthStart(date));
    setRouteKey("");
    setPayload({ routes: [], delivery_stops: [] });
  }

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Operations reports</p>
          <h1>Delivery manifest history</h1>
          <p>
            Pick a day and route to review the full retained manifest, its stop
            sequence, and the latest available delivery signal.
          </p>
        </div>
        <button
          className={styles.printButton}
          type="button"
          onClick={() => window.print()}
          disabled={!selected}
        >
          <Printer size={16} aria-hidden="true" />
          Print report
        </button>
      </header>

      <section className={styles.retentionNote}>
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>366-day route evidence</strong>
          <span>
            Full manifest and precise route points remain available for seven
            service dates. Older days retain company-only route evidence and
            privacy-safe ZIP-centroid stop clusters; small clusters are
            location-suppressed.
          </span>
        </div>
      </section>

      <section className={styles.datePanel} aria-label="Manifest service date">
        <div className={styles.dateHeading}>
          <div>
            <CalendarDays size={18} aria-hidden="true" />
            <span>
              <strong>Service date</strong>
              <small>{fullDate(serviceDate)}</small>
            </span>
          </div>
          <label>
            <span className={styles.srOnly}>Choose service date</span>
            <input
              type="date"
              value={serviceDate}
              min={initialWindow.minimum}
              max={initialWindow.maximum}
              onChange={(event) => chooseDate(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.productionCalendar}>
          <div className={styles.calendarHeader}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
            >
              ‹
            </button>
            <strong>{monthLabel(visibleMonth)}</strong>
            <button
              type="button"
              aria-label="Next month"
              disabled={visibleMonth >= monthStart(initialWindow.maximum)}
              onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
            >
              ›
            </button>
          </div>

          <div className={styles.calendarWeekdays} aria-hidden="true">
            {['S', 'U', 'M', 'T', 'W', 'H', 'F'].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>

          <div className={styles.calendarGrid}>
            {visibleCalendarCells.map((dateIso, index) => {
              const inMonth =
                dateIso.slice(0, 7) === visibleMonth.slice(0, 7);
              const status = calendarMap.get(dateIso) ?? "empty";
              const hasProduction = status === "final" || status === "in_day";
              const selectable =
                inMonth &&
                dateIso >= initialWindow.minimum &&
                dateIso <= initialWindow.maximum;

              return (
                <button
                  type="button"
                  key={dateIso}
                  className={`${styles.calendarDay}${
                    hasProduction ? ` ${styles.productionDay}` : ""
                  }${index % 7 <= 1 ? ` ${styles.weekendDay}` : ""}`}
                  disabled={!selectable}
                  aria-label={`${fullDate(dateIso)} · ${
                    hasProduction ? "Production available" : "No production"
                  }`}
                  aria-pressed={serviceDate === dateIso}
                  onClick={() => chooseDate(dateIso)}
                >
                  {Number(dateIso.slice(-2))}
                </button>
              );
            })}
          </div>

          <div className={styles.calendarLegend}>
            <span><i />Production available</span>
            <span>Pick any date to load that day</span>
          </div>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.workspace} aria-busy={loading}>
        <aside className={styles.routePanel}>
          <header>
            <div>
              <p className={styles.eyebrow}>Routes for selected date</p>
              <h2>{fullDate(serviceDate)}</h2>
            </div>
            <div className={styles.routeCoverage}>
              <strong>{routes.length}</strong>
              <span>
                {isDeidentified
                  ? "retained evidence routes"
                  : `${fullManifestCount} of ${routes.length} full manifests`}
              </span>
            </div>
          </header>

          <div className={styles.routeList}>
            {routes.map((route) => (
              <button
                type="button"
                key={route.route_key}
                className={
                  route.route_key === selected?.route_key
                    ? styles.activeRoute
                    : undefined
                }
                onClick={() => setRouteKey(route.route_key)}
              >
                <div>
                  <strong>{routeName(route)}</strong>
                  <span>{route.driver_name || "Driver not listed in FCC"}</span>
                  {!isDeidentified ? (
                    <small
                      className={
                        route.manifest_available
                          ? styles.manifestReady
                          : styles.manifestMissing
                      }
                    >
                      {route.manifest_available
                        ? "Full manifest available"
                        : "Manifest not collected"}
                    </small>
                  ) : null}
                </div>
                <dl>
                  <div>
                    <dt>Stops</dt>
                    <dd>{route.delivery_stop_count ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Packages</dt>
                    <dd>{route.delivery_package_count ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Last delivery</dt>
                    <dd>{formatClock(route.last_delivery_time)}</dd>
                  </div>
                </dl>
              </button>
            ))}

            {!loading && routes.length === 0 ? (
              <div className={styles.emptyRoutes}>
                <RouteIcon size={22} aria-hidden="true" />
                <strong>No routes reported</strong>
                <span>No retained FCC, manifest, or cluster evidence exists for this day.</span>
              </div>
            ) : null}

            {loading && routes.length === 0 ? (
              <div className={styles.loading}>Loading route manifests…</div>
            ) : null}
          </div>
        </aside>

        <section className={styles.reportPanel}>
          {selected ? (
            <>
              <header className={styles.reportHeader}>
                <div>
                  <p className={styles.eyebrow}>Selected route</p>
                  <h2>{routeName(selected)}</h2>
                  <span>
                    {isDeidentified
                      ? "De-identified route fact"
                      : selected.driver_name || "Driver not listed"} · {serviceDate}
                  </span>
                </div>
                <span
                  className={`${styles.statusPill} ${
                    selected.manifest_normalization_status === "NORMALIZED"
                      ? styles.completePill
                      : ""
                  }`}
                >
                  {selected.manifest_available || isDeidentified
                    ? selected.manifest_normalization_status
                    : "Manifest missing"}
                </span>
              </header>

              <section className={styles.summaryGrid}>
                <article>
                  <RouteIcon size={18} aria-hidden="true" />
                  <span>Manifest stops</span>
                  <strong>
                    {isDeidentified
                      ? selected.delivery_stop_count ?? "—"
                      : selected.manifest_available
                        ? selected.delivery_stop_count ?? 0
                        : "Not collected"}
                  </strong>
                  <small>
                    {isDeidentified
                      ? "Aggregate stop evidence; individual stops removed"
                      : selected.manifest_available
                        ? `${selected.completed_delivery_stop_count ?? 0} completed · ${selected.incomplete_delivery_stop_count ?? 0} open`
                        : "FCC route exists; detailed manifest is missing"}
                  </small>
                </article>
                <article>
                  <Package size={18} aria-hidden="true" />
                  <span>Manifest packages</span>
                  <strong>
                    {isDeidentified
                      ? selected.delivery_package_count ?? "—"
                      : selected.manifest_available
                        ? selected.delivery_package_count ?? 0
                        : "Not collected"}
                  </strong>
                  <small>
                    {isDeidentified
                      ? "Aggregate package count; identifiers removed"
                      : selected.manifest_available
                        ? "Normalized delivery detail"
                        : "Collection must be completed for this route"}
                  </small>
                </article>
                <article className={styles.lastDeliveryCard}>
                  <Clock3 size={18} aria-hidden="true" />
                  <span>Last stop delivered</span>
                  <strong>
                    {lastDeliveryStop?.st_number
                      ? `Stop ${lastDeliveryStop.st_number} · `
                      : ""}
                    {formatClock(selected.last_delivery_time)}
                  </strong>
                  <small>
                    {isDeidentified
                      ? selected.last_delivery_postal_code
                        ? `ZIP ${selected.last_delivery_postal_code}`
                        : "ZIP was not available in the FCC summary."
                      : selected.last_delivery_postal_code
                        ? `ZIP ${selected.last_delivery_postal_code}`
                        : "ZIP was not available in the FCC summary."}
                  </small>
                </article>
                <article>
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <span>FCC route status</span>
                  <strong>
                    {selected.deliveries_complete ? "Complete" : "In progress"}
                  </strong>
                  <small>
                    Last transmission {formatClock(selected.last_transmission_time)}
                  </small>
                </article>
              </section>

              <section className={styles.clusterSection}>
                <header>
                  <div>
                    <p className={styles.eyebrow}>Route geography</p>
                    <h3>Stop clusters by type</h3>
                  </div>
                  <span>{clusters.length} privacy-safe clusters</span>
                </header>

                {clusters.length ? (
                  <div className={styles.clusterGrid}>
                    {clusters.map((cluster) => {
                      const types = [
                        cluster.delivery_stop_count
                          ? `${cluster.delivery_stop_count} delivery`
                          : null,
                        cluster.pickup_stop_count
                          ? `${cluster.pickup_stop_count} pickup`
                          : null,
                        cluster.express_stop_count
                          ? `${cluster.express_stop_count} express`
                          : null,
                        cluster.signature_stop_count
                          ? `${cluster.signature_stop_count} signature`
                          : null,
                        cluster.hazmat_stop_count
                          ? `${cluster.hazmat_stop_count} hazmat`
                          : null,
                        cluster.collection_stop_count
                          ? `${cluster.collection_stop_count} collection`
                          : null,
                      ].filter((type): type is string => Boolean(type));

                      return (
                        <article key={cluster.cluster_key}>
                          <div className={styles.clusterTitle}>
                            <MapPin size={16} aria-hidden="true" />
                            <strong>
                              {cluster.is_location_suppressed
                                ? "Location suppressed"
                                : `ZIP ${cluster.postal_code_5}`}
                            </strong>
                            <span>{cluster.stop_count} stops</span>
                          </div>
                          <p>
                            {cluster.completed_stop_count} completed · {cluster.package_count} packages
                          </p>
                          <div className={styles.clusterTypes}>
                            {types.map((type) => (
                              <span key={type}>{type}</span>
                            ))}
                          </div>
                          <small>
                            {cluster.is_location_suppressed
                              ? `${cluster.suppressed_location_count} small ZIP group${cluster.suppressed_location_count === 1 ? "" : "s"} rolled up`
                              : cluster.centroid_latitude !== null &&
                                  cluster.centroid_longitude !== null
                                ? `ZIP centroid ${cluster.centroid_latitude.toFixed(3)}, ${cluster.centroid_longitude.toFixed(3)}`
                                : "ZIP centroid unavailable"}
                          </small>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.noClusters}>
                    No privacy-safe route clusters are available for this route and date.
                  </p>
                )}
              </section>

              <section className={styles.manifestTableSection}>
                <header>
                  <div>
                    <p className={styles.eyebrow}>Delivery manifest</p>
                    <h3>Stop sequence</h3>
                  </div>
                  <span>
                    {isDeidentified ? "Stop detail expired" : `${stops.length} retained stops`}
                  </span>
                </header>

                {!isDeidentified && selected.manifest_available ? (
                  <p className={styles.timestampBasis}>
                    FCC provides the exact latest-delivery time for the route.
                    Other manifest rows retain their planned window and
                    completion flag, but the source does not provide an actual
                    delivery timestamp for every stop.
                  </p>
                ) : null}

                <div className={styles.tableScroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>Stop</th>
                        <th>Destination ZIP</th>
                        <th>Window</th>
                        <th>Observed delivery</th>
                        <th>Packages</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stops.map((stop) => {
                        const complete = statusComplete(stop.completed);
                        const flags = [
                          stop.package_summary.express ? "Express" : null,
                          stop.package_summary.signature ? "Signature" : null,
                          stop.package_summary.hazmat ? "Hazmat" : null,
                          stop.package_summary.collection ? "Collection" : null,
                        ].filter(Boolean);
                        return (
                          <tr
                            key={stop.id}
                            className={stop.is_last_delivery ? styles.lastStopRow : undefined}
                          >
                            <td>
                              <strong>{stop.st_number || "—"}</strong>
                              <span>SID {stop.sid || "—"}</span>
                              {stop.is_last_delivery ? (
                                <small className={styles.lastStopBadge}>Last FCC delivery</small>
                              ) : null}
                            </td>
                            <td>
                              <span>
                                <MapPin size={12} aria-hidden="true" />
                                {address(stop)}
                              </span>
                            </td>
                            <td>
                              <strong>
                                {stop.delivery_time_begin || "—"}–{stop.delivery_time_end || "—"}
                              </strong>
                            </td>
                            <td>
                              {stop.delivery_observed_at_local ? (
                                <strong className={styles.observedTime}>
                                  {formatObservedTimestamp(stop.delivery_observed_at_local)}
                                </strong>
                              ) : (
                                <span>No actual timestamp in source</span>
                              )}
                            </td>
                            <td>
                              <strong>{stop.package_summary.count}</strong>
                              {flags.length ? <span>{flags.join(" · ")}</span> : null}
                            </td>
                            <td>
                              <span
                                className={`${styles.stopStatus} ${
                                  complete ? styles.stopComplete : styles.stopOpen
                                }`}
                              >
                                {complete ? "Completed" : "Open"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!loading && stops.length === 0 ? (
                  <div className={styles.emptyStops}>
                    {isDeidentified
                      ? "The extensive stop-by-stop preview is available only during the seven-day identifiable-data window. Delivery time and ZIP remain above."
                      : selected.manifest_available
                        ? "No delivery stop rows were retained for this route manifest."
                        : "FCC reported this route, but its full delivery manifest has not been collected. It remains visible because the daily route list is controlled by FCC."}
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className={styles.emptyReport}>
              <RouteIcon size={30} aria-hidden="true" />
              <strong>Select a date with reported routes</strong>
              <span>The report will show the route’s FCC timestamp and retained manifest.</span>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
