"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useDispatchWorkspaceData } from "@/features/dispatch/hooks/useDispatchWorkspaceData";
import {
  buildAllPeople,
  buildArrivedPersonIds,
  buildAvailableRoutes,
  buildHydratedRoutes,
  buildScheduledRosterIds,
  buildUnscheduledDrivers,
  createRouteSorter,
  orderedRouteLabel,
} from "@/features/dispatch/lib/dispatchSelectors";
import { buildAssignmentMapFromRoutesAndEvents } from "@/features/dispatch/lib/dispatchEventReducer";
import { buildDroPlanSignals } from "@/features/dispatch/lib/droPlanSignals";
import { buildDswDispatchSignals } from "@/features/dispatch/lib/dswDispatchSignals";
import {
  recordDispatchEvent,
  reopenDispatchDay,
} from "@/features/dispatch/lib/dispatchApi";
import { DispatchEventOverlay } from "@/features/dispatch/components/DispatchEventOverlay";
import RouteHealthOverlay, {
  type ManifestRouteHealthCard,
} from "@/features/operations/manifests/components/RouteHealthOverlay";
import ExpressReportOverlay from "@/features/operations/manifests/components/ExpressReportOverlay";
import ComplianceReportOverlay from "@/features/operations/components/ComplianceReportOverlay";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import { ExpressProgressSignal } from "@/features/operations/express/ExpressProgressSignal";
import type { ExpressDataHealth, ExpressProgress } from "@/features/operations/express/expressProgress";
import { completionNeedsWorkspaceRefresh } from "./operationsCollectionRefresh";
import { deriveOperationsCollectionSignal } from "./operationsCollectionSignal";
import { resolveOperatingDateDecision } from "./operationsOperatingCalendar";
import {
  type DispatchDayRow,
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRoute,
  type Seat,
} from "@/features/dispatch/lib/dispatchSupport";

type OperationalPhase =
  | "needs_driver"
  | "awaiting_arrival"
  | "ready"
  | "dispatched"
  | "on_route"
  | "complete";

type RouteFilter =
  | "all"
  | "ready"
  | "awaiting"
  | "unassigned"
  | "on_route"
  | "end_of_day";

function routeMatchesFilter(phase: OperationalPhase, filter: RouteFilter) {
  if (filter === "all") return true;
  if (filter === "ready") return phase === "ready";
  if (filter === "awaiting") return phase === "awaiting_arrival";
  if (filter === "unassigned") return phase === "needs_driver";
  if (filter === "on_route") {
    return phase === "dispatched" || phase === "on_route";
  }
  return phase === "complete";
}

type ExpressSignal = ExpressProgress & {
  dataHealth: Partial<ExpressDataHealth>;
};

type RouteHealthRow = ManifestRouteHealthCard;

type CollectionRequestSummary = {
  id: string;
  company_id: string;
  request_type: string;
  request_status: string;
  error_message: string | null;
  claimed_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type RunnerScheduleSummary = {
  runner_key: string;
  collection_enabled: boolean;
  operations_pulse_enabled: boolean;
  operations_pulse_start_time: string;
  operations_pulse_end_time: string;
  timezone: string;
  runner_state: string;
  runner_last_seen_at: string | null;
  runner_last_error: string | null;
  runner_metadata_json: Record<string, unknown>;
  report_config_json: Record<string, unknown>;
};

type OperatingCalendarSummary = {
  assignment_id: string;
  start_time: string | null;
  end_time: string | null;
  operating_weekdays: number[];
  operating_date_overrides: Record<string, "OPERATING" | "CLOSED">;
};

const phaseCopy: Record<
  OperationalPhase,
  { label: string; posture: "attention" | "ready" | "active" | "complete" }
> = {
  needs_driver: { label: "Unassigned", posture: "attention" },
  awaiting_arrival: { label: "Waiting", posture: "attention" },
  ready: { label: "Arrived", posture: "ready" },
  dispatched: { label: "On job", posture: "active" },
  on_route: { label: "On job", posture: "active" },
  complete: { label: "End of day", posture: "complete" },
};

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function personName(person: DispatchPerson | null) {
  return person?.full_name || "Needs driver";
}

function formatIls(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "number"
      ? value
      : Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(raw)) return null;
  const percent = raw <= 1 ? raw * 100 : raw;
  return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function easternClockParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function routeEvents(events: DispatchEventRow[], route: DispatchRoute) {
  const keys = new Set(
    [route.route_key, route.route_name, route.current_wa_num]
      .map(normalize)
      .filter(Boolean)
  );

  return events
    .filter((event) =>
      [event.route_key, event.route_label, event.from_route_key, event.to_route_key]
        .map(normalize)
        .some((key) => key && keys.has(key))
    )
    .slice()
    .reverse();
}

function routePhase(
  route: DispatchRoute,
  events: DispatchEventRow[],
  arrivedPersonIds: Set<string>,
  dispatchLocked: boolean,
  delivery:
    | ReturnType<typeof buildDswDispatchSignals>["dswSignalsByRouteKey"][string]
    | undefined
): OperationalPhase {
  const hasScannerDriver =
    Boolean(delivery?.driverName) && delivery?.scannerRole === "driver";
  const hasScannerActivity = Boolean(delivery?.driverName);
  if (!route.driver && !hasScannerDriver) return "needs_driver";
  const delivered = Number(delivery?.actualDeliveryPackages ?? 0);
  const tendered = Number(delivery?.packages ?? 0);
  const pickupsComplete = Number(delivery?.actualPickupStops ?? 0);
  const pickupsPlanned = Number(delivery?.pickupStops ?? 0);

  // Match Service's authoritative DSW end-of-day rule. A returned route may
  // still contain open service work, so return evidence takes precedence over
  // completion inferred from delivered totals.
  if (delivery?.returned) return "complete";

  if (
    tendered > 0 &&
    delivered >= tendered &&
    (pickupsPlanned === 0 || pickupsComplete >= pickupsPlanned)
  ) {
    return "complete";
  }

  if (
    delivered > 0 ||
    Number(delivery?.actualDeliveryStops ?? 0) > 0 ||
    pickupsComplete > 0
  ) {
    return "on_route";
  }

  // A named DSW driver is scanner evidence that the person is present,
  // working, and logged in even before the first delivery posts.
  if (hasScannerActivity) return "on_route";

  const eventCodes = events.map((event) =>
    `${event.event_code} ${event.event_label}`.toUpperCase()
  );

  if (eventCodes.some((value) => /DISPATCH|DEPART|ON.?ROAD/.test(value))) {
    return "dispatched";
  }

  if (dispatchLocked) return "dispatched";

  if (eventCodes.some((value) => /ARRIV/.test(value))) {
    return "ready";
  }

  if (
    route.driver?.roster_member_id &&
    arrivedPersonIds.has(route.driver.roster_member_id)
  ) {
    return "ready";
  }

  return "awaiting_arrival";
}

function Metric(props: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <span className={`ou-metric ${props.className ?? ""}`}>
      <strong>{props.value}</strong>
      <small>{props.label}</small>
    </span>
  );
}

function OperationsExpressMetric({ express }: { express: ExpressSignal }) {
  const title = `${express.complete} Complete · ${express.attempted} Attempted · ${express.open} Open · ${express.total} total`;
  return (
    <span
      className={`ou-metric ou-express-metric ${express.open > 0 ? "has-open" : express.attempted > 0 ? "has-attempted" : "is-clear"}`}
      aria-label={title}
      title={title}
    >
      <strong className="ou-express-values" aria-hidden="true">
        <span className="is-complete">{express.complete}</span>
        <i>/</i>
        <span className="is-attempted">{express.attempted}</span>
        <i>/</i>
        <span className="is-open">{express.open}</span>
      </strong>
      <small>Express</small>
    </span>
  );
}

function RouteUnit(props: {
  route: DispatchRoute;
  routeSortKey: "route_name" | "current_wa_num";
  selected: boolean;
  phase: OperationalPhase;
  plan?: ReturnType<typeof buildDroPlanSignals>["planSignalsByRouteKey"][string];
  delivery?: ReturnType<typeof buildDswDispatchSignals>["dswSignalsByRouteKey"][string];
  express?: ExpressSignal;
  onSelect: () => void;
  onOpenSeat: (seat: Seat, personId?: string) => void;
}) {
  const {
    route,
    routeSortKey,
    selected,
    phase,
    plan,
    delivery,
    express,
    onSelect,
    onOpenSeat,
  } = props;
  const effectiveDriverName =
    route.driver?.full_name ||
    (delivery?.scannerRole === "driver" ? delivery.driverName : null) ||
    null;
  const needsDriver = !effectiveDriverName;
  const hasException = Boolean(
    express?.open || express?.attempted || express?.dataHealth.referenceMatchAvailable === false
  );
  const passenger = route.helpers[0] ?? route.trainees[0] ?? null;
  const passengerRole = route.helpers[0]
    ? "Helper"
    : route.trainees[0]
      ? "Trainee"
      : "Passenger";
  const delivered = Number(delivery?.actualDeliveryPackages ?? 0);
  const tendered = Number(delivery?.packages ?? 0);
  const deliveredStops = Number(delivery?.actualDeliveryStops ?? 0);
  const tenderedStops = Number(delivery?.deliveryStops ?? 0);
  const pickupStops = Number(delivery?.pickupStops ?? 0);
  const completedPickupStops = Number(delivery?.actualPickupStops ?? 0);
  const visibleStops = tenderedStops || Number(plan?.stops ?? 0);
  const visiblePackages = tendered || Number(plan?.packages ?? 0);
  const servicePct =
    tenderedStops > 0
      ? Math.min(100, Math.round((deliveredStops / tenderedStops) * 100))
      : tendered > 0
        ? Math.min(100, Math.round((delivered / tendered) * 100))
        : 0;
  const hasDeliverySignal =
    Boolean(delivery?.driverName) ||
    deliveredStops > 0 ||
    delivered > 0 ||
    Number(delivery?.actualPickupStops ?? 0) > 0;
  const phasePresentation = phaseCopy[phase];
  const completedIls =
    phase === "complete" ? formatIls(delivery?.ilsPercent) : null;
  return (
    <article
      className={`ou-unit phase-${phase} ${express?.total ? "has-express" : ""} ${
        hasException ? "has-express-risk" : ""
      } ${hasDeliverySignal ? "has-delivery-signal" : ""} ${
        selected ? "is-selected" : ""
      } ${
        hasException || phasePresentation.posture === "attention"
          ? "needs-attention"
          : `is-${phasePresentation.posture}`
      }`}
      onClick={onSelect}
    >
      <div className="ou-unit-heading">
        <button
          type="button"
          className="ou-route-identity"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <strong>{orderedRouteLabel(route, routeSortKey)}</strong>
        </button>
        <button
          type="button"
          className={`ou-posture ${
            hasException || phasePresentation.posture === "attention"
              ? "needs-attention"
              : phasePresentation.posture
          } ${phase === "complete" ? "is-complete" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSeat("driver", route.driver?.roster_member_id);
          }}
          aria-label={`${needsDriver ? "Manage open seats" : "Manage route assignment"} for ${orderedRouteLabel(route, routeSortKey)}`}
        >
          {phase === "complete" ? (
            <span className="ou-complete-copy">
              <strong>{phasePresentation.label}</strong>
              <small>
                {servicePct}% stops
                {completedIls ? ` · ${completedIls} ILS` : ""}
              </small>
            </span>
          ) : (
            phasePresentation.label
          )}
        </button>
      </div>

      <div className="ou-assignment-line">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenSeat("driver", route.driver?.roster_member_id);
          }}
          aria-label={`Manage driver for ${orderedRouteLabel(route, routeSortKey)}`}
        >
        <strong>{effectiveDriverName || personName(route.driver)}</strong>
        </button>
        {passenger ? (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="ou-passenger"
              onClick={(event) => {
                event.stopPropagation();
                onOpenSeat(
                  passengerRole === "Helper" ? "helper" : "trainee",
                  passenger.roster_member_id
                );
              }}
              aria-label={`Manage ${passengerRole.toLowerCase()} ${passenger.full_name}`}
            >
              <span className="ou-seat-pill">
                {passengerRole === "Helper" ? "H" : "T"}
              </span>
              <span>{passenger.full_name}</span>
            </button>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className={`ou-activity ${express?.total ? "has-four" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <Metric
          label="Stops"
          value={`${deliveredStops}/${visibleStops || "—"}`}
        />
        <Metric
          label="Packages"
          value={`${delivered}/${visiblePackages || "—"}`}
        />
        <Metric
          label="PU"
          value={`${completedPickupStops}/${pickupStops}`}
        />
        {express?.total ? (
          <OperationsExpressMetric express={express} />
        ) : null}
      </button>

      {hasDeliverySignal ? (
        <div
          className="ou-progress-road"
          role="img"
          aria-label={`${servicePct}% of route delivery stops complete`}
        >
          <span
            className="ou-progress-trail"
            style={{ width: `${servicePct}%` }}
          />
          <span
            className="ou-progress-truck"
            style={{ left: `${servicePct}%` }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 28 16" focusable="false">
              <path d="M1 2h16v9H1zM17 5h5l5 5v1H17z" />
              <circle cx="7" cy="13" r="2.5" />
              <circle cx="22" cy="13" r="2.5" />
            </svg>
          </span>
          <span className="ou-progress-flag" aria-hidden="true">🏁</span>
        </div>
      ) : null}

    </article>
  );
}

function Section(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ou-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function AttendanceOverlay(props: {
  open: boolean;
  people: DispatchPerson[];
  arrivedPersonIds: Set<string>;
  assignmentByPersonId: Map<string, { route: DispatchRoute; seat: Seat }>;
  routeSortKey: "route_name" | "current_wa_num";
  savingPersonId: string | null;
  onClose: () => void;
  onToggle: (
    person: DispatchPerson,
    assignment?: { route: DispatchRoute; seat: Seat }
  ) => void;
}) {
  const [query, setQuery] = useState("");
  if (!props.open) return null;

  const needle = query.trim().toLowerCase();
  const people = props.people.filter((person) =>
    person.full_name.toLowerCase().includes(needle)
  );

  return (
    <div className="ou-overlay-backdrop">
      <section className="ou-attendance-overlay">
        <header>
          <span>
            <small>Today’s workforce</small>
            <h2>Attendance</h2>
          </span>
          <button type="button" onClick={props.onClose} aria-label="Close attendance">
            ×
          </button>
        </header>
        <div className="ou-attendance-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a person"
            autoFocus
          />
        </div>
        <div className="ou-attendance-list">
          {people.map((person) => {
            const assignment = props.assignmentByPersonId.get(
              person.roster_member_id
            );
            const present = props.arrivedPersonIds.has(person.roster_member_id);
            return (
              <div key={person.roster_member_id}>
                <span>
                  <strong>{person.full_name}</strong>
                  <small>
                    {assignment
                      ? `${assignment.seat} · ${orderedRouteLabel(assignment.route, props.routeSortKey)}`
                      : "Not assigned to a route"}
                  </small>
                </span>
                <button
                  type="button"
                  className={present ? "is-present" : ""}
                  disabled={props.savingPersonId === person.roster_member_id}
                  onClick={() => props.onToggle(person, assignment)}
                >
                  {props.savingPersonId === person.roster_member_id
                    ? "Saving…"
                    : present
                      ? "Present"
                      : "Mark present"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function OperationsWorkspacePage({
  active,
  slug,
  serviceDate,
}: {
  active: boolean;
  slug: string;
  serviceDate: string;
}) {
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<Seat>("driver");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [seatCandidateId, setSeatCandidateId] = useState("");
  const [savingSeat, setSavingSeat] = useState(false);
  const [expressRows, setExpressRows] = useState<RouteHealthRow[]>([]);
  const [savingPresencePersonId, setSavingPresencePersonId] = useState<
    string | null
  >(null);
  const [eventOverlayOpen, setEventOverlayOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [complianceReportOpen, setComplianceReportOpen] = useState(false);
  const [expressReportOpen, setExpressReportOpen] = useState(false);
  const [routeEvidenceOpen, setRouteEvidenceOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [collectionRequests, setCollectionRequests] = useState<
    CollectionRequestSummary[]
  >([]);
  const [runnerSchedule, setRunnerSchedule] =
    useState<RunnerScheduleSummary | null>(null);
  const [operatingCalendar, setOperatingCalendar] =
    useState<OperatingCalendarSummary | null>(null);
  const [collectionOperationalDate, setCollectionOperationalDate] =
    useState<string | null>(null);
  const [latestIngestionSuccessAt, setLatestIngestionSuccessAt] =
    useState<string | null>(null);
  const [canManageOperatingCalendar, setCanManageOperatingCalendar] =
    useState(false);
  const [savingOperatingOverride, setSavingOperatingOverride] = useState(false);
  const [operatingOverrideError, setOperatingOverrideError] =
    useState<string | null>(null);
  const [signalNow, setSignalNow] = useState(() => Date.now());
  const refreshedCompletionIds = useRef(new Set<string>());

  const {
    dispatchDay,
    dispatchEvents,
    droPlanRows,
    dswRows,
    error,
    eventTypes,
    lastHydrationStartedAt,
    loading,
    refreshKey,
    refreshWorkspace,
    routeSortKey,
    rosterRows,
    routes,
    scheduleRows,
    setDispatchDay,
    setDispatchEvents,
    setError,
  } = useDispatchWorkspaceData(slug, serviceDate);

  useEffect(() => {
    if (!active) return;

    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function loadCollectionRequests() {
      try {
        const response = await fetch(
          `/api/company/${slug}/collection-requests?mode=status&limit=10`,
          { credentials: "include", cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Unable to load collection status."
          );
        }
        if (!mounted) return;

        const rows = Array.isArray(data?.rows)
          ? (data.rows as CollectionRequestSummary[])
          : [];
        setCollectionRequests(rows);
        setRunnerSchedule(
          data?.runner_schedule
            ? (data.runner_schedule as RunnerScheduleSummary)
            : null
        );
        setOperatingCalendar(
          data?.operating_calendar
            ? (data.operating_calendar as OperatingCalendarSummary)
            : null
        );
        setCollectionOperationalDate(
          typeof data?.operational_date === "string"
            ? data.operational_date
            : null
        );
        setLatestIngestionSuccessAt(
          typeof data?.latest_ingestion_success_at === "string"
            ? data.latest_ingestion_success_at
            : null
        );
        setCanManageOperatingCalendar(
          data?.can_manage_operating_calendar === true
        );

        const companyId =
          typeof data?.company_id === "string" ? data.company_id : null;
        if (!companyId || !mounted) return;

        const handleRequestChange = (payload: {
          new: Record<string, unknown>;
        }) => {
          if (!mounted) return;
          const row = payload.new as unknown as CollectionRequestSummary;
          if (!row.id || row.company_id !== companyId) return;

          setCollectionRequests((current) => [
            row,
            ...current.filter((request) => request.id !== row.id),
          ].slice(0, 10));

          if (
            row.request_status === "COMPLETE" &&
            !row.error_message &&
            !refreshedCompletionIds.current.has(row.id)
          ) {
            refreshedCompletionIds.current.add(row.id);
            refreshWorkspace();
          }
        };

        channel = supabase
          .channel(`operations-collection-terminal:${companyId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "core",
              table: "operations_collection_request",
              filter: `company_id=eq.${companyId}`,
            },
            handleRequestChange
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "core",
              table: "operations_collection_request",
              filter: `company_id=eq.${companyId}`,
            },
            handleRequestChange
          )
          .subscribe();
      } catch {
        // Initial workspace data remains usable if the collection signal is
        // temporarily unavailable. Manual Refresh is still authoritative.
      }
    }

    void loadCollectionRequests();

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [active, refreshWorkspace, slug]);

  useEffect(() => {
    if (!active || !lastHydrationStartedAt) return;

    const missedCompletion = collectionRequests.find(
      (request) =>
        !refreshedCompletionIds.current.has(request.id) &&
        completionNeedsWorkspaceRefresh(request, lastHydrationStartedAt)
    );

    if (!missedCompletion) return;

    refreshedCompletionIds.current.add(missedCompletion.id);
    refreshWorkspace();
  }, [active, collectionRequests, lastHydrationStartedAt, refreshWorkspace]);

  useEffect(() => {
    if (!active) return;
    const timerId = window.setInterval(() => setSignalNow(Date.now()), 30_000);
    return () => window.clearInterval(timerId);
  }, [active]);

  const operatingDateDecision = useMemo(() => {
    const operationalDate =
      collectionOperationalDate ?? easternClockParts(new Date(signalNow)).date;
    const dayOfWeek = new Date(`${operationalDate}T00:00:00Z`).getUTCDay();

    return resolveOperatingDateDecision({
      operationalDate,
      dayOfWeek,
      operatingWeekdays: operatingCalendar?.operating_weekdays,
      operatingDateOverrides: operatingCalendar?.operating_date_overrides,
    });
  }, [collectionOperationalDate, operatingCalendar, signalNow]);

  const collectionSignal = useMemo(() => {
    return deriveOperationsCollectionSignal({
      now: new Date(signalNow),
      operationalDate: collectionOperationalDate,
      latestIngestionSuccessAt,
      requests: collectionRequests,
      runnerSchedule,
      operatingCalendar,
    });
  }, [
    collectionOperationalDate,
    collectionRequests,
    latestIngestionSuccessAt,
    operatingCalendar,
    runnerSchedule,
    signalNow,
  ]);

  async function updateOperatingDateOverride(
    overrideMode: "OPERATING" | "INHERIT"
  ) {
    if (!collectionOperationalDate || savingOperatingOverride) return;

    try {
      setSavingOperatingOverride(true);
      setOperatingOverrideError(null);
      const response = await fetch(
        `/api/company/${slug}/operations/collection-calendar`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operational_date: collectionOperationalDate,
            override_mode: overrideMode,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Failed to update today’s collection calendar."
        );
      }

      setOperatingCalendar((current) => {
        if (!current) return current;
        const overrides = { ...current.operating_date_overrides };
        if (overrideMode === "INHERIT") {
          delete overrides[collectionOperationalDate];
        } else {
          overrides[collectionOperationalDate] = overrideMode;
        }
        return { ...current, operating_date_overrides: overrides };
      });
      setSignalNow(Date.now());
    } catch (overrideError) {
      setOperatingOverrideError(
        overrideError instanceof Error
          ? overrideError.message
          : "Failed to update today’s collection calendar."
      );
    } finally {
      setSavingOperatingOverride(false);
    }
  }

  const routeSort = useMemo(
    () => createRouteSorter(routeSortKey),
    [routeSortKey]
  );
  const routeLabelForDisplay = (route: DispatchRoute) =>
    orderedRouteLabel(route, routeSortKey);

  const hydratedRoutes = useMemo(
    () =>
      buildHydratedRoutes({
        routes,
        scheduleRows,
        serviceDate,
        routeSort,
      }),
    [routeSort, routes, scheduleRows, serviceDate]
  );

  const routeUnits = useMemo(
    () =>
      Object.values(
        buildAssignmentMapFromRoutesAndEvents(hydratedRoutes, dispatchEvents)
      ).sort(routeSort),
    [dispatchEvents, hydratedRoutes, routeSort]
  );

  const allPeople = useMemo(
    () => buildAllPeople({ scheduleRows, dispatchEvents, serviceDate }),
    [dispatchEvents, scheduleRows, serviceDate]
  );
  const scheduledRosterIds = useMemo(
    () => buildScheduledRosterIds(scheduleRows, serviceDate),
    [scheduleRows, serviceDate]
  );
  const unscheduledDrivers = useMemo(
    () =>
      buildUnscheduledDrivers({
        allPeople,
        rosterRows,
        scheduledRosterIds,
      }),
    [allPeople, rosterRows, scheduledRosterIds]
  );
  const availableRoutes = useMemo(
    () =>
      buildAvailableRoutes({
        dispatchRoutes: routeUnits,
        routes,
        routeSort,
      }),
    [routeSort, routeUnits, routes]
  );

  const { planSignalsByRouteKey } = useMemo(
    () => buildDroPlanSignals(routeUnits, droPlanRows),
    [droPlanRows, routeUnits]
  );

  const { dswSignalsByRouteKey } = useMemo(
    () => buildDswDispatchSignals(routeUnits, dswRows),
    [dswRows, routeUnits]
  );

  useEffect(() => {
    let active = true;

    async function loadExpress() {
      try {
        const response = await fetch(
          `/api/company/${slug}/operations/route-health?serviceDate=${serviceDate}`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = await response.json();
        if (active && response.ok) {
          setExpressRows(Array.isArray(payload.routes) ? payload.routes : []);
        }
      } catch {
        if (active) setExpressRows([]);
      }
    }

    if (slug) void loadExpress();
    return () => {
      active = false;
    };
  }, [refreshKey, serviceDate, slug]);

  const manifestHealthByRouteKey = useMemo(() => {
    const index = new Map<string, RouteHealthRow>();
    expressRows.forEach((row) => {
      [row.route_key, row.route_label].forEach((value) => {
        const key = normalize(value);
        if (key) index.set(key, row);
      });
    });

    return routeUnits.reduce<Record<string, RouteHealthRow>>((result, route) => {
      const candidates = [route.route_key, route.route_name, route.current_wa_num]
        .map(normalize)
        .filter(Boolean);
      const direct = candidates.map((key) => index.get(key)).find(Boolean);
      const row = direct;

      if (row) {
        result[route.route_key] = row;
      }
      return result;
    }, {});
  }, [expressRows, routeUnits]);

  const expressByRouteKey = useMemo(
    () =>
      Object.entries(manifestHealthByRouteKey).reduce<
        Record<string, ExpressSignal>
      >((result, [routeKey, row]) => {
        result[routeKey] = {
          total: Number(row.express.package_count ?? 0),
          complete: Number(row.express.complete_package_count ?? 0),
          attempted: Number(row.express.attempted_package_count ?? 0),
          open: Number(row.express.open_package_count ?? 0),
          dataHealth: {
            trackingIdentityMissing: Number(row.express.data_health.tracking_identity_missing_count ?? 0),
            stopLinkMissing: Number(row.express.data_health.stop_link_missing_count ?? 0),
            stopLinkAmbiguous: Number(row.express.data_health.stop_link_ambiguous_count ?? 0),
            referenceMatchAvailable: row.express.data_health.reference_match_available !== false,
          },
        };
        return result;
      }, {}),
    [manifestHealthByRouteKey]
  );

  const selectedRoute =
    routeUnits.find((route) => route.route_key === selectedRouteKey) ?? null;
  const selectedEvents = selectedRoute
    ? routeEvents(dispatchEvents, selectedRoute)
    : [];
  const selectedPlan = selectedRoute
    ? planSignalsByRouteKey[selectedRoute.route_key]
    : undefined;
  const selectedDelivery = selectedRoute
    ? dswSignalsByRouteKey[selectedRoute.route_key]
    : undefined;
  const selectedManifestHealth = selectedRoute
    ? manifestHealthByRouteKey[selectedRoute.route_key] ?? null
    : null;
  const selectedExpress = selectedRoute
    ? expressByRouteKey[selectedRoute.route_key]
    : undefined;
  const selectedEffectiveDriverName =
    selectedRoute?.driver?.full_name ||
    (selectedDelivery?.scannerRole === "driver"
      ? selectedDelivery.driverName
      : null) ||
    null;
  const selectedHasDeliveryEvidence = Boolean(
    selectedDelivery?.driverName ||
      Number(selectedDelivery?.actualDeliveryStops ?? 0) > 0 ||
      Number(selectedDelivery?.actualDeliveryPackages ?? 0) > 0
  );

  const arrivedPersonIds = useMemo(() => {
    const ids = buildArrivedPersonIds(dispatchEvents);
    Object.values(dswSignalsByRouteKey).forEach((signal) => {
      if (signal.matchedRosterMemberId) {
        ids.add(signal.matchedRosterMemberId);
      }
    });
    return ids;
  }, [dispatchEvents, dswSignalsByRouteKey]);
  const selectedDswPerson =
    selectedDelivery?.matchedRosterMemberId
      ? allPeople.find(
          (person) =>
            person.roster_member_id ===
            selectedDelivery.matchedRosterMemberId
        ) ?? null
      : null;
  const selectedSeatPeople = selectedRoute
    ? selectedSeat === "driver"
      ? selectedRoute.driver
        ? [selectedRoute.driver]
        : selectedDelivery?.scannerRole === "driver" && selectedDswPerson
          ? [selectedDswPerson]
          : []
      : selectedSeat === "helper"
        ? selectedRoute.helpers
        : selectedRoute.trainees
    : [];
  const selectedPerson =
    selectedSeatPeople.find(
      (person) => person.roster_member_id === selectedPersonId
    ) ??
    selectedSeatPeople[0] ??
    null;
  const selectedPersonPresent = Boolean(
    selectedPerson?.roster_member_id &&
      arrivedPersonIds.has(selectedPerson.roster_member_id)
  );
  const assignedSeatPeople = selectedRoute
    ? selectedSeat === "driver"
      ? selectedRoute.driver
        ? [selectedRoute.driver]
        : []
      : selectedSeat === "helper"
        ? selectedRoute.helpers
        : selectedRoute.trainees
    : [];
  const seatCandidates = useMemo(() => {
    const candidates = new Map<string, DispatchPerson>();
    [...allPeople, ...unscheduledDrivers].forEach((person) => {
      candidates.set(person.roster_member_id, person);
    });
    return [...candidates.values()].sort((a, b) =>
      a.full_name.localeCompare(b.full_name)
    );
  }, [allPeople, unscheduledDrivers]);

  useEffect(() => {
    setSeatCandidateId("");
  }, [selectedRouteKey, selectedSeat]);

  const assignmentByPersonId = useMemo(() => {
    const assignments = new Map<
      string,
      { route: DispatchRoute; seat: Seat }
    >();
    routeUnits.forEach((route) => {
      if (route.driver) {
        assignments.set(route.driver.roster_member_id, {
          route,
          seat: "driver",
        });
      }
      const scannerDriverId =
        dswSignalsByRouteKey[route.route_key]?.matchedRosterMemberId;
      if (scannerDriverId) {
        const scannerRole =
          dswSignalsByRouteKey[route.route_key]?.scannerRole ?? "driver";
        assignments.set(scannerDriverId, {
          route,
          seat: scannerRole,
        });
      }
      route.helpers.forEach((person) =>
        assignments.set(person.roster_member_id, { route, seat: "helper" })
      );
      route.trainees.forEach((person) =>
        assignments.set(person.roster_member_id, { route, seat: "trainee" })
      );
    });
    return assignments;
  }, [dswSignalsByRouteKey, routeUnits]);

  async function togglePersonPresence(
    person: DispatchPerson,
    assignment?: { route: DispatchRoute; seat: Seat }
  ) {
    if (savingPresencePersonId) {
      return;
    }
    const present = arrivedPersonIds.has(person.roster_member_id);
    try {
      setSavingPresencePersonId(person.roster_member_id);
      setError(null);
      const { ok, data } = await recordDispatchEvent({
        slug,
        dispatchDate: serviceDate,
        payload: {
          event_category: "ATTENDANCE",
          event_code: present ? "UNDO_ARRIVED" : "ARRIVED",
          event_label: present ? "Arrival reversed" : "Arrived",
          seat: assignment?.seat ?? null,
          person_roster_member_id: person.roster_member_id,
          person_name: person.full_name,
          route_key: assignment?.route.route_key ?? null,
          route_label: assignment
            ? routeLabelForDisplay(assignment.route)
            : null,
          event_payload: {
            source: "operational_unit_workspace",
            seat: assignment?.seat ?? null,
            arrived: !present,
          },
        },
      });

      if (!ok) {
        setError(data?.error ?? "Failed to update driver presence.");
        return;
      }

      if (data?.event) {
        setDispatchEvents((current) => [
          ...current,
          data.event as DispatchEventRow,
        ]);
      }
      if (data?.dispatch_day) {
        setDispatchDay(data.dispatch_day);
      }
    } catch {
      setError("Failed to update driver presence.");
    } finally {
      setSavingPresencePersonId(null);
    }
  }

  function toggleSelectedPersonPresence() {
    if (!selectedPerson) return;
    const assignment = assignmentByPersonId.get(
      selectedPerson.roster_member_id
    );
    void togglePersonPresence(selectedPerson, assignment);
  }

  async function saveSeatAssignment(
    eventCode: string,
    eventLabel: string,
    person: DispatchPerson | null
  ) {
    if (!selectedRoute || savingSeat) {
      return;
    }

    try {
      setSavingSeat(true);
      setError(null);
      const { ok, data } = await recordDispatchEvent({
        slug,
        dispatchDate: serviceDate,
        payload: {
          event_category: "ASSIGNMENT",
          event_code: eventCode,
          event_label: eventLabel,
          route_key: selectedRoute.route_key,
          route_label: routeLabelForDisplay(selectedRoute),
          to_route_key: selectedRoute.route_key,
          to_route_label: routeLabelForDisplay(selectedRoute),
          seat: selectedSeat,
          person_roster_member_id: person?.roster_member_id ?? null,
          person_name: person?.full_name ?? null,
          event_payload: {
            source: "operational_unit_seat_edit",
          },
        },
      });

      if (!ok) {
        setError(data?.error ?? "Failed to update the route seat.");
        return;
      }
      if (data?.event) {
        setDispatchEvents((current) => [
          ...current,
          data.event as DispatchEventRow,
        ]);
      }
      if (data?.dispatch_day) setDispatchDay(data.dispatch_day);
      setSeatCandidateId("");
    } catch {
      setError("Failed to update the route seat.");
    } finally {
      setSavingSeat(false);
    }
  }

  function assignSelectedSeat() {
    const person =
      seatCandidates.find(
        (candidate) => candidate.roster_member_id === seatCandidateId
      ) ?? null;
    if (!person) return;

    const suffix =
      selectedSeat === "driver"
        ? "DRIVER"
        : selectedSeat === "helper"
          ? "HELPER"
          : "TRAINEE";
    const label =
      selectedSeat === "driver"
        ? "Driver assigned"
        : selectedSeat === "helper"
          ? "Helper assigned"
          : "Trainee assigned";
    void saveSeatAssignment(`ASSIGN_${suffix}`, label, person);
  }

  function unassignSelectedSeat() {
    const person = assignedSeatPeople.find(
      (candidate) => candidate.roster_member_id === selectedPersonId
    ) ?? assignedSeatPeople[0] ?? null;
    if (!person) return;

    const suffix =
      selectedSeat === "driver"
        ? "DRIVER"
        : selectedSeat === "helper"
          ? "HELPER"
          : "TRAINEE";
    const label =
      selectedSeat === "driver"
        ? "Driver unassigned"
        : selectedSeat === "helper"
          ? "Helper unassigned"
          : "Trainee unassigned";
    void saveSeatAssignment(`UNASSIGN_${suffix}`, label, person);
  }

  async function addManualDispatchEvent(payload: {
    event_code: string;
    event_label: string;
    event_category: string;
    note: string;
    person_roster_member_id: string | null;
    person_name: string | null;
    route_key?: string | null;
    route_label?: string | null;
    event_payload?: Record<string, unknown>;
    walk_on_full_name?: string | null;
    walk_on_record_mode?: "CANDIDATE" | "WALK_ON";
    walk_on_roster_member_id?: string | null;
    walk_on_dswid?: string | null;
    walk_on_workforce_unit_id?: string | null;
    walk_on_new_workforce_unit_name?: string | null;
    walk_on_service_date?: string | null;
  }) {
    try {
      setSavingEvent(true);
      setError(null);
      let walkOnRosterId: string | null = null;
      const walkOnName = payload.walk_on_full_name?.trim();
      const walkOnRecordMode = payload.walk_on_record_mode ?? "WALK_ON";
      const eventServiceDate = payload.walk_on_service_date || serviceDate;

      if (walkOnName) {
        const response = await fetch(`/api/company/${slug}/dispatch/walk-on`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            record_mode: walkOnRecordMode,
            roster_member_id: payload.walk_on_roster_member_id,
            full_name: walkOnName,
            dswid: payload.walk_on_dswid,
            workforce_unit_id: payload.walk_on_workforce_unit_id,
            new_workforce_unit_name: payload.walk_on_new_workforce_unit_name,
            seen_date: eventServiceDate,
            note: payload.note,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(result?.error ?? "Failed to save walk-on driver.");
          return;
        }
        walkOnRosterId =
          typeof result?.roster_member_id === "string"
            ? result.roster_member_id
            : null;
      }

      const { ok, data } = await recordDispatchEvent({
        slug,
        dispatchDate: eventServiceDate,
        payload: {
          ...payload,
          event_code: walkOnName ? "ADD_DRIVER" : payload.event_code,
          event_label: walkOnName
            ? walkOnRecordMode === "CANDIDATE"
              ? "Walk-on candidate added"
              : "Walk-on driver added"
            : payload.event_label,
          person_roster_member_id:
            walkOnRosterId || payload.person_roster_member_id,
          person_name: walkOnName || payload.person_name,
          route_key: payload.route_key ?? null,
          route_label: payload.route_label ?? null,
          event_payload: walkOnName
            ? {
                ...(payload.event_payload ?? {}),
                source: "dispatch_walk_on_driver",
                assignment_source: walkOnRecordMode,
                roster_member_id: walkOnRosterId,
                service_date: eventServiceDate,
                workforce_unit_id: payload.walk_on_workforce_unit_id ?? null,
              }
            : payload.event_payload ?? {},
        },
      });

      if (!ok) {
        setError(data?.error ?? "Failed to add dispatch event.");
        return;
      }
      if (data?.event && eventServiceDate === serviceDate) {
        setDispatchEvents((current) => [
          ...current,
          data.event as DispatchEventRow,
        ]);
      }
      if (data?.dispatch_day && eventServiceDate === serviceDate) {
        setDispatchDay(data.dispatch_day);
      }
      setEventOverlayOpen(false);
    } catch {
      setError("Failed to add dispatch event.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function returnToDispatch() {
    if (handoffSaving || dispatchDay?.status !== "LOCKED") return;

    try {
      setHandoffSaving(true);
      setError(null);
      const { ok, data } = await reopenDispatchDay({
        slug,
        dispatchDate: serviceDate,
      });
      if (!ok) {
        setError(data?.error ?? "Failed to return the operation to Dispatch.");
        return;
      }
      if (data?.dispatch_day) {
        setDispatchDay(data.dispatch_day as DispatchDayRow);
      }
      if (data?.event) {
        setDispatchEvents((current) => [
          ...current,
          data.event as DispatchEventRow,
        ]);
      }
      setEventOverlayOpen(false);
    } catch {
      setError("Failed to return the operation to Dispatch.");
    } finally {
      setHandoffSaving(false);
    }
  }

  const unitsWithPhase = useMemo(
    () =>
      routeUnits.map((route) => ({
        route,
        phase: routePhase(
          route,
          routeEvents(dispatchEvents, route),
          arrivedPersonIds,
          dispatchDay?.status === "LOCKED",
          dswSignalsByRouteKey[route.route_key]
        ),
        hasException: Boolean(
          expressByRouteKey[route.route_key]?.open ||
            expressByRouteKey[route.route_key]?.attempted
        ),
      })),
    [
      arrivedPersonIds,
      dispatchDay?.status,
      dispatchEvents,
      dswSignalsByRouteKey,
      expressByRouteKey,
      routeUnits,
    ]
  );

  const routeFilterCounts = useMemo(() => {
    const counts: Record<RouteFilter, number> = {
      all: unitsWithPhase.length,
      ready: 0,
      awaiting: 0,
      unassigned: 0,
      on_route: 0,
      end_of_day: 0,
    };

    for (const { phase } of unitsWithPhase) {
      if (routeMatchesFilter(phase, "ready")) counts.ready += 1;
      if (routeMatchesFilter(phase, "awaiting")) counts.awaiting += 1;
      if (routeMatchesFilter(phase, "unassigned")) counts.unassigned += 1;
      if (routeMatchesFilter(phase, "on_route")) counts.on_route += 1;
      if (routeMatchesFilter(phase, "end_of_day")) counts.end_of_day += 1;
    }

    return counts;
  }, [unitsWithPhase]);

  const availableRouteFilters: Array<{
    key: RouteFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All", count: routeFilterCounts.all },
    {
      key: "ready",
      label: "Arrived",
      count: routeFilterCounts.ready,
    },
    {
      key: "awaiting",
      label: "Waiting",
      count: routeFilterCounts.awaiting,
    },
    {
      key: "unassigned",
      label: "Unassigned",
      count: routeFilterCounts.unassigned,
    },
    {
      key: "on_route",
      label: "On Job",
      count: routeFilterCounts.on_route,
    },
    {
      key: "end_of_day",
      label: "End of day",
      count: routeFilterCounts.end_of_day,
    },
  ];
  const routeFilters = availableRouteFilters.filter(
    (filter) => filter.key === "all" || filter.count > 0
  );

  useEffect(() => {
    if (routeFilter !== "all" && routeFilterCounts[routeFilter] === 0) {
      setRouteFilter("all");
    }
  }, [routeFilter, routeFilterCounts]);

  const visibleUnits = unitsWithPhase.filter(({ phase }) =>
    routeMatchesFilter(phase, routeFilter)
  );

  return (
    <main className="ou-shell">
      <header className="ou-header">
        <span>
          <h1>Operations</h1>
        </span>
      </header>

      <OperationsWorkspaceToolbar
        slug={slug}
        statusText={collectionSignal.copy}
        statusTone={collectionSignal.tone}
        refreshing={loading}
        onActions={() => setEventOverlayOpen(true)}
        actionsLabel="Actions"
        onComplianceReport={() => setComplianceReportOpen(true)}
        onExpressReport={() => setExpressReportOpen(true)}
        onAttendance={() => setAttendanceOpen(true)}
        onRefresh={refreshWorkspace}
        onUpload={() => setUploadOverlayOpen(true)}
      />

      {error ? <div className="ou-error">{error}</div> : null}

      <div className={`ou-layout ${selectedRoute ? "has-selection" : ""}`}>
        <section className="ou-collection" aria-label="Route operational units">
          <header>
            <span>
              <small
                className={
                  collectionSignal.tone === "active"
                    ? "is-active"
                    : collectionSignal.tone === "critical"
                      ? "is-critical"
                      : ""
                }
              >
                {routeUnits.length} routes · {serviceDate} ·{" "}
                {collectionSignal.copy}
              </small>
              {operatingDateDecision.override === "OPERATING" ? (
                <small className="ou-supplemental-day-signal">
                  Supplemental collection day
                </small>
              ) : null}
              {operatingOverrideError ? (
                <small role="alert" className="ou-operating-override-error">
                  {operatingOverrideError}
                </small>
              ) : null}
            </span>

          </header>

          {loading ? <p className="ou-empty">Loading operational units…</p> : null}

          <nav className="ou-route-filters" aria-label="Filter route responsibilities">
            {routeFilters.map((filter) => (
              <button
                type="button"
                key={filter.key}
                className={routeFilter === filter.key ? "is-active" : ""}
                onClick={() => setRouteFilter(filter.key)}
                aria-pressed={routeFilter === filter.key}
              >
                <span>{filter.label}</span>
                <strong className="ou-filter-count">{filter.count}</strong>
              </button>
            ))}
          </nav>

          <div className="ou-grid">
            {visibleUnits.map(({ route, phase }) => (
              <RouteUnit
                key={route.route_key}
                route={route}
                routeSortKey={routeSortKey}
                selected={route.route_key === selectedRouteKey}
                phase={phase}
                plan={planSignalsByRouteKey[route.route_key]}
                delivery={dswSignalsByRouteKey[route.route_key]}
                express={expressByRouteKey[route.route_key]}
                onSelect={() => setSelectedRouteKey(route.route_key)}
                onOpenSeat={(seat, personId) => {
                  setSelectedRouteKey(route.route_key);
                  setSelectedSeat(seat);
                  setSelectedPersonId(personId ?? null);
                }}
              />
            ))}
          </div>
        </section>

        {selectedRoute ? (
          <aside className="ou-workspace" aria-label={`${routeLabelForDisplay(selectedRoute)} operational workspace`}>
            <header className="ou-workspace-header">
              <span>
                <small>Operational workspace</small>
                <h2>{routeLabelForDisplay(selectedRoute)}</h2>
                <p>{selectedEffectiveDriverName || personName(selectedRoute.driver)}</p>
              </span>
              <button
                type="button"
                onClick={() => setSelectedRouteKey(null)}
                aria-label="Close operational workspace"
              >
                ×
              </button>
            </header>

            <div className="ou-workspace-body">
              {selectedHasDeliveryEvidence ? (
                <Section title="Delivery evidence">
                  <div className="ou-delivery-evidence">
                    <div>
                      <span><small>Stops</small><strong>{selectedDelivery?.actualDeliveryStops ?? 0} / {selectedDelivery?.deliveryStops ?? 0}</strong></span>
                      <span><small>Packages</small><strong>{selectedDelivery?.actualDeliveryPackages ?? 0} / {selectedDelivery?.packages ?? 0}</strong></span>
                      <span><small>Pickups</small><strong>{selectedDelivery?.actualPickupStops ?? 0} / {selectedDelivery?.pickupStops ?? 0}</strong></span>
                    </div>
                    <p>
                      <strong>{selectedManifestHealth ? "Manifest evidence linked" : "Waiting for matched manifest evidence"}</strong>
                      <small>
                        {selectedManifestHealth
                          ? `${selectedManifestHealth.status} · ${selectedManifestHealth.artifacts.total} artifacts`
                          : "DSW progress remains authoritative while manifest capture catches up."}
                      </small>
                    </p>
                    <button
                      type="button"
                      onClick={() => setRouteEvidenceOpen(true)}
                    >
                      Open delivery evidence
                    </button>
                  </div>
                </Section>
              ) : null}

              <Section title="Current responsibility">
                <dl className="ou-facts">
                  <div><dt>State</dt><dd>{selectedEffectiveDriverName ? "In service" : "Unassigned"}</dd></div>
                  <div><dt>Service date</dt><dd>{serviceDate}</dd></div>
                </dl>
              </Section>

              <Section title="Seats">
                <div className="ou-seats">
                  <button
                    type="button"
                    className={selectedSeat === "driver" ? "is-active" : ""}
                    onClick={() => {
                      setSelectedSeat("driver");
                      setSelectedPersonId(
                        (selectedDelivery?.scannerRole === "driver"
                          ? selectedDelivery.matchedRosterMemberId
                          : null) ??
                          selectedRoute.driver?.roster_member_id ??
                          null
                      );
                    }}
                  >
                    <span><small>Driver</small><strong>{selectedEffectiveDriverName || personName(selectedRoute.driver)}</strong></span>
                    <span>{selectedEffectiveDriverName ? "Manage" : "Assign"}</span>
                  </button>
                  {selectedPerson ? (
                    <button
                      type="button"
                      className={`ou-presence ${selectedPersonPresent ? "is-present" : ""}`}
                      onClick={toggleSelectedPersonPresence}
                      disabled={Boolean(savingPresencePersonId)}
                    >
                      <span>
                        <small>Work posture</small>
                        <strong>
                          {selectedPersonPresent
                            ? "Present / on job"
                            : `${selectedPerson.full_name} not marked present`}
                        </strong>
                      </span>
                      <span>
                        {savingPresencePersonId
                          ? "Saving…"
                          : selectedPersonPresent
                            ? "Undo"
                            : "Mark present"}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={selectedSeat === "helper" ? "is-active" : ""}
                    onClick={() => {
                      setSelectedSeat("helper");
                      setSelectedPersonId(
                        selectedRoute.helpers[0]?.roster_member_id ?? null
                      );
                    }}
                  >
                    <span><small>Helper</small><strong>{selectedRoute.helpers.map((person) => person.full_name).join(", ") || "Open seat"}</strong></span>
                    <span>{selectedRoute.helpers.length ? "Manage" : "Add"}</span>
                  </button>
                  <button
                    type="button"
                    className={selectedSeat === "trainee" ? "is-active" : ""}
                    onClick={() => {
                      setSelectedSeat("trainee");
                      setSelectedPersonId(
                        selectedRoute.trainees[0]?.roster_member_id ?? null
                      );
                    }}
                  >
                    <span><small>Trainee</small><strong>{selectedRoute.trainees.map((person) => person.full_name).join(", ") || "Open seat"}</strong></span>
                    <span>{selectedRoute.trainees.length ? "Manage" : "Add"}</span>
                  </button>
                  <div className="ou-seat-editor">
                    <select
                      value={seatCandidateId}
                      onChange={(event) => setSeatCandidateId(event.target.value)}
                      disabled={savingSeat}
                      aria-label={`Choose ${selectedSeat}`}
                    >
                      <option value="">
                        Choose {selectedSeat}
                      </option>
                      {seatCandidates.map((person) => {
                        const assignment = assignmentByPersonId.get(
                          person.roster_member_id
                        );
                        return (
                          <option
                            key={person.roster_member_id}
                            value={person.roster_member_id}
                          >
                            {person.full_name}
                            {assignment
                              ? ` · ${routeLabelForDisplay(assignment.route)}`
                              : " · Available"}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={assignSelectedSeat}
                      disabled={
                        !seatCandidateId ||
                        savingSeat
                      }
                    >
                      {savingSeat ? "Saving…" : `Assign ${selectedSeat}`}
                    </button>
                    {assignedSeatPeople.length ? (
                      <button
                        type="button"
                        className="is-destructive"
                        onClick={unassignSelectedSeat}
                        disabled={savingSeat}
                      >
                        Unassign {selectedSeat}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="ou-seat-note">
                  {selectedSeat === "driver"
                    ? "Driver assignment, arrival, and dispatch controls belong here."
                    : selectedSeat === "helper"
                      ? "Helper assignment and removal controls belong here."
                      : "Trainee assignment and removal controls belong here."}
                </p>
              </Section>

              <Section title="Operational signals">
                <div className="ou-workspace-signals">
                  <span>Plan · {selectedPlan?.stops ?? "—"} stops · {selectedPlan?.packages ?? "—"} packages</span>
                  <span>Delivery · {selectedDelivery?.deliveryStops ?? "—"} stops · {selectedDelivery?.pickupStops ?? "—"} pickups</span>
                  <span>
                    FedEx scanner ·{" "}
                    {selectedDelivery?.returned
                      ? `Returned · ${selectedDelivery.driverName ?? "Driver"}`
                      : selectedDelivery?.driverName
                      ? `${selectedDelivery.scannerRole === "helper" ? "Helper" : selectedDelivery.scannerRole === "trainee" ? "Trainee" : "Driver"} logged in · ${selectedDelivery.driverName}`
                      : "No login reported"}
                  </span>
                  {selectedExpress ? (
                    <ExpressProgressSignal
                      className="ou-workspace-express"
                      progress={selectedExpress}
                      dataHealth={selectedExpress.dataHealth}
                    />
                  ) : (
                    <span>Express · No manifest volume</span>
                  )}
                </div>
              </Section>

              <Section title="Timeline">
                {selectedDelivery?.driverName || selectedEvents.length ? (
                  <ol className="ou-timeline">
                    {selectedDelivery?.driverName ? (
                      <li>
                        <time>DSW</time>
                        <span>
                          <strong>
                            {selectedDelivery.returned
                              ? "FedEx route returned"
                              : "FedEx scanner login"}
                          </strong>
                          <small>
                            {selectedDelivery.driverName} ·{" "}
                            {selectedDelivery.scannerRole === "helper"
                              ? "helper"
                              : selectedDelivery.scannerRole === "trainee"
                                ? "trainee"
                                : "driver"}{" "}
                            ·{" "}
                            {selectedDelivery.returned
                              ? "end-of-day DSW evidence"
                              : "live service evidence"}
                            {selectedDelivery.generatedAtText
                              ? ` · ${selectedDelivery.generatedAtText}`
                              : ""}
                          </small>
                        </span>
                      </li>
                    ) : null}
                    {selectedEvents.slice(0, 8).map((event) => (
                      <li key={event.id}>
                        <time>{eventTime(event.created_at)}</time>
                        <span>
                          <strong>{event.event_label}</strong>
                          {event.note ? <small>{event.note}</small> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="ou-empty">No route events recorded.</p>
                )}
              </Section>

              <Section title="Available actions">
                <p className="ou-empty">
                  Seat-specific controls remain in this workspace. Use Actions above for route, workforce, call-out, and note exceptions.
                </p>
              </Section>
            </div>
          </aside>
        ) : null}
      </div>

      <DispatchEventOverlay
        slug={slug}
        serviceDate={serviceDate}
        open={eventOverlayOpen}
        saving={savingEvent}
        eventTypes={eventTypes}
        scheduledWorkforce={allPeople}
        unscheduledDrivers={unscheduledDrivers}
        availableRoutes={availableRoutes}
        activeRoutes={routeUnits}
        phase={dispatchDay?.status === "LOCKED" ? "delivery" : "dispatch"}
        handoffSaving={handoffSaving}
        onReturnToDispatch={
          dispatchDay?.status === "LOCKED" ? returnToDispatch : undefined
        }
        onPrepareCorrectiveAction={() => {
          window.location.href = `/company/${slug}/people/corrective-actions?source=${dispatchDay?.status === "LOCKED" ? "delivery" : "dispatch"}&incidentDate=${serviceDate}`;
        }}
        supplementalCollectionAction={
          canManageOperatingCalendar &&
          collectionOperationalDate === serviceDate &&
          (!operatingDateDecision.operates ||
            operatingDateDecision.override === "OPERATING")
            ? {
                label:
                  operatingDateDecision.override === "OPERATING"
                    ? "Use normal calendar"
                    : "Collect today",
                saving: savingOperatingOverride,
                onAction: () =>
                  updateOperatingDateOverride(
                    operatingDateDecision.override === "OPERATING"
                      ? "INHERIT"
                      : "OPERATING"
                  ),
              }
            : undefined
        }
        onClose={() => setEventOverlayOpen(false)}
        onSubmit={addManualDispatchEvent}
      />
      <AttendanceOverlay
        open={attendanceOpen}
        people={allPeople}
        arrivedPersonIds={arrivedPersonIds}
        assignmentByPersonId={assignmentByPersonId}
        routeSortKey={routeSortKey}
        savingPersonId={savingPresencePersonId}
        onClose={() => setAttendanceOpen(false)}
        onToggle={(person, assignment) => {
          void togglePersonPresence(person, assignment);
        }}
      />

      <OperationsReportUploadOverlay
        open={uploadOverlayOpen}
        onClose={(shouldRefresh) => {
          setUploadOverlayOpen(false);
          if (shouldRefresh) refreshWorkspace();
        }}
      />

      <RouteHealthOverlay
        open={routeEvidenceOpen && Boolean(selectedRoute)}
        slug={slug}
        serviceDate={serviceDate}
        routeLabel={
          selectedRoute ? routeLabelForDisplay(selectedRoute) : "Route"
        }
        health={selectedManifestHealth}
        dsw={
          selectedDelivery
            ? {
                planned_delivery_stops: selectedDelivery.deliveryStops,
                actual_delivery_stops: selectedDelivery.actualDeliveryStops,
                vscan_packages: selectedDelivery.packages,
                actual_delivery_packages:
                  selectedDelivery.actualDeliveryPackages,
                planned_pickup_stops: selectedDelivery.pickupStops,
                actual_pickup_stops: selectedDelivery.actualPickupStops,
                actual_pickup_packages:
                  selectedDelivery.actualPickupPackages,
                generated_at_text: selectedDelivery.generatedAtText,
                ils_percent: selectedDelivery.ilsPercent,
                miles: selectedDelivery.miles,
              }
            : null
        }
        onClose={() => setRouteEvidenceOpen(false)}
      />
      <ExpressReportOverlay
        open={expressReportOpen}
        slug={slug}
        serviceDate={serviceDate}
        surfaceLabel="Operations"
        onClose={() => setExpressReportOpen(false)}
      />
      <ComplianceReportOverlay
        open={complianceReportOpen}
        slug={slug}
        onClose={() => setComplianceReportOpen(false)}
      />

      <style jsx global>{`
        .ou-shell {
          min-height: 100vh;
          background: #f4f6f9;
          color: #172033;
          padding: 18px;
        }
        .ou-header {
          max-width: 1600px;
          margin: 0 auto 14px;
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
        }
        .ou-header small, .ou-workspace-header small {
          color: #697386;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: .09em;
          text-transform: uppercase;
        }
        .ou-header h1, .ou-workspace-header h2 { margin: 3px 0; }
        .ou-header p, .ou-workspace-header p { margin: 0; color: #697386; }
        .ou-header-actions { display: flex; align-items: center; gap: 9px; }
        .ou-dispatch-action,
        .ou-attendance-action,
        .ou-report-action {
          min-height: 40px;
          border: 1px solid #9aa8c3;
          border-radius: 10px;
          background: #fff;
          padding: 0 13px;
          color: #253655;
          font-weight: 850;
          cursor: pointer;
        }
        .ou-dispatch-action:hover,
        .ou-attendance-action:hover,
        .ou-report-action:hover { border-color: #5369a8; background: #f6f8fd; }
        .ou-dispatch-action:disabled,
        .ou-attendance-action:disabled,
        .ou-report-action:disabled { cursor: not-allowed; opacity: .58; }
        .ou-layout {
          max-width: 1600px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        .ou-layout.has-selection { grid-template-columns: minmax(0, 1fr) minmax(340px, 420px); }
        .ou-collection, .ou-workspace {
          border: 1px solid #d8dee8;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 10px 30px rgba(20, 31, 53, .06);
        }
        .ou-collection > header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #e7ebf1;
        }
        .ou-collection > header span { display: grid; gap: 2px; }
        .ou-collection > header small { color: #7a8495; }
        .ou-collection > header small.is-active { color: #315f9c; font-weight: 750; }
        .ou-collection > header small.is-critical { color: #b91c1c; font-weight: 850; }
        .ou-supplemental-day-signal { color: #047857 !important; font-weight: 850; }
        .ou-operating-override-error { color: #b91c1c !important; font-weight: 750; }
        .ou-route-filters {
          display: flex;
          gap: 7px;
          padding: 10px 10px 0;
          overflow-x: auto;
        }
        .ou-route-filters button {
          flex: 0 0 auto;
          min-height: 32px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #d8dee8;
          border-radius: 999px;
          background: #fff;
          padding: 0 11px;
          color: #5d677a;
          font-size: 11px;
          font-weight: 850;
          cursor: pointer;
        }
        .ou-route-filters button.is-active {
          border-color: #5369a8;
          background: #f1f4fb;
          color: #253655;
        }
        .ou-filter-count {
          min-width: 19px;
          height: 19px;
          display: inline-grid;
          place-items: center;
          border-radius: 999px;
          background: #eef1f6;
          color: #4c5870;
          font-size: 10px;
          line-height: 1;
        }
        .ou-route-filters button.is-active .ou-filter-count {
          background: #5369a8;
          color: #fff;
        }
        .ou-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(265px, 1fr));
          gap: 10px;
          padding: 10px;
        }
        .ou-unit {
          --ou-signal: 83, 105, 168;
          --ou-posture: 83, 105, 168;
          min-width: 0;
          position: relative;
          isolation: isolate;
          display: grid;
          gap: 7px;
          padding: 9px 13px;
          border: 1px solid #dfe4ec;
          border-radius: 13px;
          background:
            radial-gradient(circle at 100% 100%, rgba(var(--ou-signal), .085), transparent 58%),
            #fff;
          color: inherit;
          text-align: left;
          overflow: hidden;
          transition:
            transform 160ms cubic-bezier(.2,.8,.2,1),
            border-color 160ms ease,
            box-shadow 160ms ease,
            background-color 160ms ease;
        }
        .ou-unit::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          opacity: 0;
          background: radial-gradient(circle at 100% 100%, rgba(var(--ou-signal), .09), transparent 54%);
          transition: opacity 160ms ease;
        }
        .ou-unit:hover {
          transform: translateY(-3px);
          border-color: rgba(var(--ou-signal), .42);
          box-shadow:
            0 15px 30px rgba(20, 31, 53, .10),
            0 5px 12px rgba(var(--ou-signal), .06);
        }
        .ou-unit:hover::before { opacity: 1; }
        .ou-unit.phase-needs_driver {
          --ou-signal: 190, 54, 54;
          --ou-posture: 190, 54, 54;
          border-color: rgba(190, 54, 54, .46);
          background:
            radial-gradient(circle at 100% 100%, rgba(190, 54, 54, .20), transparent 62%),
            #fff9f9;
          box-shadow: 0 8px 20px rgba(190, 54, 54, .08);
        }
        .ou-unit.phase-awaiting_arrival {
          --ou-signal: 194, 132, 36;
          --ou-posture: 194, 132, 36;
          border-color: rgba(194, 132, 36, .24);
          background:
            radial-gradient(circle at 100% 100%, rgba(194, 132, 36, .17), transparent 60%),
            linear-gradient(145deg, #fff 42%, #fff8eb);
        }
        .ou-unit.phase-ready {
          --ou-signal: 45, 103, 184;
          --ou-posture: 45, 103, 184;
          border-color: rgba(45, 103, 184, .28);
          background:
            radial-gradient(circle at 100% 100%, rgba(45, 103, 184, .19), transparent 60%),
            linear-gradient(145deg, #fff 42%, #edf5ff);
          box-shadow: 0 8px 20px rgba(45, 103, 184, .055);
        }
        .ou-unit.phase-dispatched { --ou-signal: 103, 58, 183; --ou-posture: 103, 58, 183; }
        .ou-unit.phase-on_route { --ou-signal: 103, 58, 183; --ou-posture: 103, 58, 183; }
        .ou-unit.phase-complete { --ou-signal: 42, 122, 92; --ou-posture: 42, 122, 92; }
        .ou-unit.has-delivery-signal {
          --ou-signal: 103, 58, 183;
          --ou-posture: 103, 58, 183;
          background:
            radial-gradient(circle at 100% 100%, rgba(103, 58, 183, .16), transparent 60%),
            linear-gradient(145deg, #fff 44%, rgba(245, 240, 255, .78));
        }
        .ou-unit.phase-complete.has-delivery-signal {
          --ou-signal: 42, 122, 92;
          --ou-posture: 42, 122, 92;
          background:
            radial-gradient(circle at 100% 100%, rgba(42, 122, 92, .17), transparent 60%),
            linear-gradient(145deg, #fff 44%, rgba(237, 248, 242, .88));
        }
        .ou-unit.phase-needs_driver { --ou-signal: 190, 54, 54; --ou-posture: 190, 54, 54; }
        .ou-unit.is-selected {
          border-color: rgba(var(--ou-signal), .62);
          box-shadow: 0 0 0 2px rgba(var(--ou-signal), .11), 0 12px 28px rgba(20, 31, 53, .08);
        }
        .ou-unit button { font: inherit; }
        .ou-unit-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
        .ou-route-identity {
          min-width: 0;
          border: 0;
          background: transparent;
          padding: 0;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .ou-route-identity strong { font-size: 17px; }
        .ou-posture, .ou-signal {
          border: 0;
          border-radius: 999px;
          padding: 2px 0;
          background: transparent;
          font-size: 10px;
          font-weight: 850;
          white-space: nowrap;
        }
        .ou-posture::before {
          content: "";
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-right: 5px;
          border-radius: 999px;
          background: rgb(var(--ou-posture));
        }
        .ou-posture.is-complete {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
          line-height: 1;
        }
        .ou-posture.is-complete::before {
          width: 6px;
          height: 6px;
          margin-right: 4px;
        }
        .ou-complete-copy {
          display: grid;
          gap: 2px;
          text-align: left;
        }
        .ou-complete-copy strong {
          font-size: 9px;
          line-height: 1;
        }
        .ou-complete-copy small {
          font-size: 7.5px;
          font-weight: 750;
          line-height: 1;
        }
        button.ou-posture { cursor: pointer; }
        .ou-posture { color: rgb(var(--ou-posture)); }
        .ou-signal.normal { color: #24613c; }
        .ou-signal.caution { color: #8a5311; }
        .ou-unit.phase-needs_driver .ou-posture { color: #a32929; }
        .ou-signal.critical { background: #fce8e8; color: #9a3030; }
        .ou-progress-road {
          position: relative;
          height: 18px;
          margin: 0 -13px -9px;
          overflow: hidden;
          border-top: 1px solid rgba(103, 58, 183, .18);
          background: #dfe3e9;
        }
        .ou-progress-trail {
          position: absolute;
          inset: 0 auto 0 0;
          min-width: 3px;
          background: repeating-linear-gradient(
            115deg,
            #5f259f 0 9px,
            #159f6e 9px 18px,
            #ff6a13 18px 27px
          );
          transition: width 500ms cubic-bezier(.2,.8,.2,1);
        }
        .ou-progress-truck {
          position: absolute;
          z-index: 2;
          top: 1px;
          width: 26px;
          height: 15px;
          transform: translateX(-50%);
          filter: drop-shadow(0 2px 2px rgba(15,23,42,.34));
          transition: left 500ms cubic-bezier(.2,.8,.2,1);
        }
        .ou-progress-truck svg {
          display: block;
          width: 100%;
          height: 100%;
          fill: #fff;
          stroke: rgba(41, 28, 72, .58);
          stroke-width: .7;
        }
        .ou-progress-flag {
          position: absolute;
          z-index: 3;
          right: 4px;
          top: 1px;
          font-size: 13px;
          line-height: 1;
          filter: drop-shadow(0 1px 1px rgba(255,255,255,.7));
        }
        .ou-assignment-line {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          padding: 0;
          color: #3f4b5e;
          text-align: left;
          overflow: hidden;
        }
        .ou-assignment-line button {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 0;
          background: transparent;
          padding: 0;
          color: inherit;
          cursor: pointer;
        }
        .ou-assignment-line button:hover { color: #23395f; }
        .ou-assignment-line strong,
        .ou-passenger > span:last-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ou-seat-pill {
          display: inline-grid;
          place-items: center;
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #eef1f5;
          color: #536176;
          font-size: 10px;
          font-weight: 900;
        }
        .ou-activity {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          width: 100%;
          border: 0;
          background: transparent;
          padding: 0;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .ou-activity.has-four {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 5px;
        }
        .ou-activity.has-four .ou-metric { padding: 6px 4px; }
        .ou-activity.has-four .ou-metric strong { font-size: 12px; }
        .ou-metric {
          display: grid;
          place-items: center;
          gap: 1px;
          padding: 6px 8px;
          border-radius: 9px;
          background: #f5f7fa;
          text-align: center;
        }
        .ou-metric strong { font-size: 14px; }
        .ou-metric small { color: #7a8495; font-size: 9px; line-height: 1.2; }
        .ou-express-metric {
          min-width: 0;
          border: 1px solid #dfe4ec;
          background: #fff;
        }
        .ou-express-metric.has-open { border-color: #fdba74; }
        .ou-express-metric.has-attempted { border-color: #c4b5fd; }
        .ou-express-metric.is-clear { border-color: #86efac; }
        .ou-express-values {
          min-width: 0;
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 2px;
          white-space: nowrap;
          line-height: 1;
        }
        .ou-express-values span { font-weight: 900; }
        .ou-express-values i {
          color: #cbd5e1;
          font-size: 8px;
          font-style: normal;
          font-weight: 750;
        }
        .ou-express-values .is-complete { color: #15803d; }
        .ou-express-values .is-attempted { color: #7c3aed; }
        .ou-express-values .is-open { color: #c2410c; }
        }
        .ou-groups { display: grid; gap: 2px; padding: 4px 0 10px; }
        .ou-group > header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px 2px;
          color: #59667a;
        }
        .ou-group > header strong {
          font-size: 11px;
          letter-spacing: .07em;
          text-transform: uppercase;
        }
        .ou-group > header small {
          display: grid;
          place-items: center;
          min-width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #eef1f5;
          font-weight: 800;
        }
        .ou-workspace {
          position: sticky;
          top: 12px;
          max-height: calc(100vh - 24px);
          overflow: hidden;
        }
        .ou-workspace-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid #e7ebf1;
        }
        .ou-workspace-header button {
          width: 34px;
          height: 34px;
          border: 1px solid #d8dee8;
          border-radius: 9px;
          background: #fff;
          font-size: 22px;
          cursor: pointer;
        }
        .ou-workspace-body { max-height: calc(100vh - 125px); overflow: auto; }
        .ou-section { padding: 15px 16px; border-bottom: 1px solid #e7ebf1; }
        .ou-section h3 { margin: 0 0 11px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #657084; }
        .ou-facts { display: grid; gap: 8px; margin: 0; }
        .ou-facts div { display: flex; justify-content: space-between; gap: 18px; }
        .ou-facts dt { color: #7a8495; }
        .ou-facts dd { margin: 0; font-weight: 750; text-align: right; }
        .ou-relationships { display: flex; flex-wrap: wrap; gap: 7px; }
        .ou-relationships button {
          border: 1px solid #d8dee8;
          border-radius: 9px;
          background: #f8f9fb;
          padding: 7px 9px;
          color: #374258;
        }
        .ou-seats { display: grid; gap: 7px; }
        .ou-seats > button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          border: 1px solid #dfe4ec;
          border-radius: 10px;
          background: #fff;
          padding: 9px 10px;
          color: #3d485b;
          text-align: left;
          cursor: pointer;
        }
        .ou-seats > button.is-active {
          border-color: #8293bd;
          background: #f6f8fd;
        }
        .ou-seats > button.ou-presence {
          border-style: dashed;
          background: #fffdf8;
        }
        .ou-seats > button.ou-presence.is-present {
          border-style: solid;
          border-color: #9ccdb0;
          background: #f4fbf7;
        }
        .ou-seats > button.ou-presence:disabled {
          cursor: not-allowed;
          opacity: .62;
        }
        .ou-seats > button > span:first-child { display: grid; gap: 2px; min-width: 0; }
        .ou-seats small { color: #7a8495; font-size: 9px; letter-spacing: .07em; text-transform: uppercase; }
        .ou-seats strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ou-seats > button > span:last-child { color: #5369a8; font-size: 11px; font-weight: 850; }
        .ou-seat-editor {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 7px;
          padding-top: 3px;
        }
        .ou-seat-editor select,
        .ou-seat-editor button {
          min-height: 36px;
          border: 1px solid #d8dee8;
          border-radius: 9px;
          background: #fff;
          padding: 0 10px;
          color: #344056;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
        }
        .ou-seat-editor select { min-width: 0; }
        .ou-seat-editor button { cursor: pointer; }
        .ou-seat-editor button:hover:not(:disabled) {
          border-color: #5369a8;
          background: #f6f8fd;
        }
        .ou-seat-editor button.is-destructive {
          grid-column: 1 / -1;
          color: #a32929;
          border-color: #efc7c7;
          background: #fffafa;
        }
        .ou-seat-editor select:disabled,
        .ou-seat-editor button:disabled {
          cursor: not-allowed;
          opacity: .58;
        }
        .ou-seat-note { margin: 9px 0 0; color: #7a8495; font-size: 12px; line-height: 1.4; }
        .ou-delivery-evidence { display: grid; gap: 9px; }
        .ou-delivery-evidence > div {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }
        .ou-delivery-evidence > div span {
          display: grid;
          gap: 2px;
          padding: 9px;
          border: 1px solid rgba(103, 58, 183, .16);
          border-radius: 9px;
          background: #f7f3ff;
        }
        .ou-delivery-evidence small {
          color: #7a8495;
          font-size: 9px;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .ou-delivery-evidence p {
          display: grid;
          gap: 3px;
          margin: 0;
          color: #3f4b5e;
          font-size: 12px;
        }
        .ou-delivery-evidence p small {
          line-height: 1.4;
          letter-spacing: 0;
          text-transform: none;
        }
        .ou-delivery-evidence > button {
          min-height: 38px;
          border: 1px solid #6d3db8;
          border-radius: 9px;
          background: #f7f3ff;
          color: #5f259f;
          font-weight: 850;
          cursor: pointer;
        }
        .ou-delivery-evidence > button:hover {
          background: #efe7ff;
          box-shadow: 0 6px 16px rgba(95, 37, 159, .12);
        }
        .ou-workspace-signals { display: grid; gap: 7px; }
        .ou-workspace-signals span { padding: 9px; border-radius: 9px; background: #f5f7fa; }
        .ou-workspace-express { width: 100%; box-sizing: border-box; }
        .ou-timeline { display: grid; gap: 11px; margin: 0; padding: 0; list-style: none; }
        .ou-timeline li { display: grid; grid-template-columns: 58px 1fr; gap: 9px; }
        .ou-timeline time { color: #7a8495; font-size: 12px; }
        .ou-timeline span { display: grid; gap: 2px; }
        .ou-timeline small { color: #7a8495; }
        .ou-empty { margin: 0; color: #7a8495; line-height: 1.45; }
        .ou-error {
          max-width: 1600px;
          margin: 0 auto 12px;
          padding: 11px 13px;
          border: 1px solid #efb9b9;
          border-radius: 10px;
          background: #fff1f1;
          color: #8f2929;
          font-weight: 750;
        }
        .ou-overlay-backdrop {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(15, 23, 42, .35);
        }
        .ou-attendance-overlay {
          width: min(560px, 100%);
          max-height: min(760px, calc(100vh - 32px));
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          overflow: hidden;
          border: 1px solid #d8dee8;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 30px 80px rgba(13, 22, 40, .24);
        }
        .ou-attendance-overlay > header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px 16px;
          border-bottom: 1px solid #e7ebf1;
        }
        .ou-attendance-overlay h2 { margin: 2px 0 0; }
        .ou-attendance-overlay header small { color: #697386; font-size: 10px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
        .ou-attendance-overlay header button {
          width: 34px;
          height: 34px;
          border: 1px solid #d8dee8;
          border-radius: 9px;
          background: #fff;
          font-size: 22px;
          cursor: pointer;
        }
        .ou-attendance-search { padding: 10px 12px; border-bottom: 1px solid #e7ebf1; }
        .ou-attendance-search input {
          width: 100%;
          min-height: 40px;
          border: 1px solid #d8dee8;
          border-radius: 10px;
          padding: 0 11px;
          font: inherit;
        }
        .ou-attendance-list { overflow: auto; padding: 6px 12px 12px; }
        .ou-attendance-list > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 2px;
          border-bottom: 1px solid #edf0f4;
        }
        .ou-attendance-list > div > span { display: grid; gap: 2px; min-width: 0; }
        .ou-attendance-list small { color: #7a8495; }
        .ou-attendance-list button {
          flex: 0 0 auto;
          min-height: 32px;
          border: 1px solid #d8dee8;
          border-radius: 9px;
          background: #fff;
          padding: 0 10px;
          color: #5369a8;
          font-weight: 850;
          cursor: pointer;
        }
        .ou-attendance-list button.is-present {
          border-color: #9ccdb0;
          background: #f4fbf7;
          color: #276440;
        }
        @media (hover: none) {
          .ou-unit:hover {
            transform: none;
            border-color: #dfe4ec;
            box-shadow: none;
          }
          .ou-unit:hover::before { opacity: 0; }
          .ou-unit.is-selected {
            border-color: rgba(var(--ou-signal), .62);
            box-shadow: 0 0 0 2px rgba(var(--ou-signal), .11);
          }
        }
        @media (max-width: 980px) {
          .ou-layout.has-selection { grid-template-columns: 1fr; }
          .ou-workspace {
            position: fixed;
            inset: 8%;
            z-index: 50;
            max-height: none;
            box-shadow: 0 30px 80px rgba(13, 22, 40, .28);
          }
          .ou-workspace-body { max-height: calc(84vh - 100px); }
        }
        @media (max-width: 620px) {
          .ou-shell { padding: 10px; }
          .ou-header { align-items: stretch; flex-direction: column; }
          .ou-header-actions { align-items: stretch; flex-direction: column; }
          .ou-collection > header { align-items: stretch; flex-direction: column; }
          .ou-grid { grid-template-columns: 1fr; }
          .ou-workspace { inset: 0; border: 0; border-radius: 0; }
          .ou-workspace-body { max-height: calc(100vh - 100px); }
        }
      `}</style>
    </main>
  );
}
