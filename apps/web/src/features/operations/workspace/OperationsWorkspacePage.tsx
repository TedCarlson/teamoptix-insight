"use client";

import { useEffect, useMemo, useState } from "react";
import { useDispatchWorkspaceData } from "@/features/dispatch/hooks/useDispatchWorkspaceData";
import {
  buildAllPeople,
  buildArrivedPersonIds,
  buildAvailableRoutes,
  buildHydratedRoutes,
  buildScheduledRosterIds,
  buildUnscheduledDrivers,
  createRouteSorter,
} from "@/features/dispatch/lib/dispatchSelectors";
import { buildAssignmentMapFromRoutesAndEvents } from "@/features/dispatch/lib/dispatchEventReducer";
import { buildDroPlanSignals } from "@/features/dispatch/lib/droPlanSignals";
import { buildDswDispatchSignals } from "@/features/dispatch/lib/dswDispatchSignals";
import {
  lockDispatchDay,
  recordDispatchEvent,
} from "@/features/dispatch/lib/dispatchApi";
import { DispatchEventOverlay } from "@/features/dispatch/components/DispatchEventOverlay";
import {
  routeLabel,
  todayIso,
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRoute,
  type Seat,
} from "@/features/dispatch/lib/dispatchSupport";

type Horizon = "operations" | "planning";

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

type ExpressSignal = {
  packages: number;
  open: number;
  gaps: number;
};

type RouteHealthRow = {
  route_key: string;
  route_label: string | null;
  express: {
    package_count: number;
    incomplete_package_count: number;
    tracking_gap_package_count: number;
  };
};

const horizonCopy: Record<
  Horizon,
  { label: string; question: string }
> = {
  operations: {
    label: "Today’s Operation",
    question: "How is each route responsibility progressing?",
  },
  planning: {
    label: "Tomorrow’s Planning",
    question: "What is likely to happen tomorrow?",
  },
};

const horizonOrder: Horizon[] = ["operations", "planning"];

const phaseCopy: Record<
  OperationalPhase,
  { label: string; posture: "attention" | "ready" | "active" | "complete" }
> = {
  needs_driver: { label: "Unassigned", posture: "attention" },
  awaiting_arrival: { label: "Awaiting arrival", posture: "attention" },
  ready: { label: "In seat", posture: "ready" },
  dispatched: { label: "In seat", posture: "active" },
  on_route: { label: "On job", posture: "active" },
  complete: { label: "Complete", posture: "complete" },
};

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function personName(person: DispatchPerson | null) {
  return person?.full_name || "Needs driver";
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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
  if (!route.driver) return "needs_driver";

  const delivered = Number(delivery?.actualDeliveryPackages ?? 0);
  const tendered = Number(delivery?.packages ?? 0);
  const pickupsComplete = Number(delivery?.actualPickupStops ?? 0);
  const pickupsPlanned = Number(delivery?.pickupStops ?? 0);

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

function RouteUnit(props: {
  route: DispatchRoute;
  selected: boolean;
  horizon: Horizon;
  phase: OperationalPhase;
  plan?: ReturnType<typeof buildDroPlanSignals>["planSignalsByRouteKey"][string];
  delivery?: ReturnType<typeof buildDswDispatchSignals>["dswSignalsByRouteKey"][string];
  express?: ExpressSignal;
  onSelect: () => void;
  onOpenSeat: (seat: Seat, personId?: string) => void;
}) {
  const {
    route,
    selected,
    horizon,
    phase,
    plan,
    delivery,
    express,
    onSelect,
    onOpenSeat,
  } = props;
  const needsDriver = !route.driver;
  const hasException = Boolean(express?.gaps || express?.open);
  const passenger = route.helpers[0] ?? route.trainees[0] ?? null;
  const passengerRole = route.helpers[0]
    ? "Helper"
    : route.trainees[0]
      ? "Trainee"
      : "Passenger";
  const delivered = Number(delivery?.actualDeliveryPackages ?? 0);
  const tendered = Number(delivery?.packages ?? 0);
  const remaining = Math.max(0, tendered - delivered);
  const servicePct = tendered > 0 ? Math.min(100, Math.round((delivered / tendered) * 100)) : 0;
  const phasePresentation = phaseCopy[phase];
  const expressClass = express?.packages
    ? express?.open || express?.gaps
      ? "ou-express-metric has-attention"
      : "ou-express-metric has-express"
    : "ou-express-metric is-muted";

  return (
    <article
      className={`ou-unit phase-${phase} ${express?.packages ? "has-express" : ""} ${
        hasException ? "has-express-risk" : ""
      } ${selected ? "is-selected" : ""} ${
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
          <strong>{routeLabel(route)}</strong>
        </button>
        <button
          type="button"
          className={`ou-posture ${
            hasException || phasePresentation.posture === "attention"
              ? "needs-attention"
              : phasePresentation.posture
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSeat("driver", route.driver?.roster_member_id);
          }}
          aria-label={`${needsDriver ? "Manage open seats" : "Manage route assignment"} for ${routeLabel(route)}`}
        >
          {phasePresentation.label}
        </button>
      </div>

      <div className="ou-assignment-line">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenSeat("driver", route.driver?.roster_member_id);
          }}
          aria-label={`Manage driver for ${routeLabel(route)}`}
        >
        <strong>{personName(route.driver)}</strong>
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
        className="ou-activity"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        {horizon === "operations" &&
        (phase === "needs_driver" ||
          phase === "awaiting_arrival" ||
          phase === "ready") ? (
          <>
            <Metric
              label="Stops"
              value={delivery?.deliveryStops ?? plan?.stops ?? "—"}
            />
            <Metric
              label="Packages"
              value={delivery?.packages ?? plan?.packages ?? "—"}
            />
            <Metric
              label="Express"
              value={express?.packages ?? 0}
              className={expressClass}
            />
          </>
        ) : null}

        {horizon === "planning" ? (
          <>
            <Metric label="Stops" value={plan?.stops ?? "—"} />
            <Metric label="Packages" value={plan?.packages ?? "—"} />
            <Metric label="Miles" value={plan?.milesLabel ?? "—"} />
          </>
        ) : null}

        {horizon === "operations" &&
        (phase === "on_route" || phase === "dispatched") ? (
          <>
            <Metric label="Tendered" value={tendered || "—"} />
            <Metric label="Delivered" value={delivered} />
            <Metric label="Remaining" value={remaining} />
          </>
        ) : null}

        {horizon === "operations" && phase === "complete" ? (
          <>
            <Metric label="Delivered" value={delivered} />
            <Metric label="Service" value={`${servicePct}%`} />
            <Metric
              label="Express"
              value={express?.packages ?? 0}
              className={expressClass}
            />
          </>
        ) : null}
      </button>

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
  locked: boolean;
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
                      ? `${assignment.seat} · ${routeLabel(assignment.route)}`
                      : "Not assigned to a route"}
                  </small>
                </span>
                <button
                  type="button"
                  className={present ? "is-present" : ""}
                  disabled={
                    props.locked ||
                    props.savingPersonId === person.roster_member_id
                  }
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

export default function OperationsWorkspacePage({ slug }: { slug: string }) {
  const serviceDate = todayIso();
  const [horizon, setHorizon] = useState<Horizon>("operations");
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<Seat>("driver");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [expressRows, setExpressRows] = useState<RouteHealthRow[]>([]);
  const [savingPresencePersonId, setSavingPresencePersonId] = useState<
    string | null
  >(null);
  const [eventOverlayOpen, setEventOverlayOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [handoffSaving, setHandoffSaving] = useState(false);

  const {
    dispatchDay,
    dispatchEvents,
    droPlanRows,
    dswRows,
    error,
    eventTypes,
    loading,
    routeSortKey,
    rosterRows,
    routes,
    scheduleRows,
    setDispatchDay,
    setDispatchEvents,
    setError,
  } = useDispatchWorkspaceData(slug, serviceDate);

  const routeSort = useMemo(
    () => createRouteSorter(routeSortKey),
    [routeSortKey]
  );

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
  }, [serviceDate, slug]);

  const expressByRouteKey = useMemo(() => {
    const index = new Map<string, RouteHealthRow>();
    expressRows.forEach((row) => {
      [row.route_key, row.route_label].forEach((value) => {
        const key = normalize(value);
        if (key) index.set(key, row);
      });
    });

    return routeUnits.reduce<Record<string, ExpressSignal>>((result, route) => {
      const candidates = [route.route_key, route.route_name, route.current_wa_num]
        .map(normalize)
        .filter(Boolean);
      const direct = candidates.map((key) => index.get(key)).find(Boolean);
      const row =
        direct ??
        expressRows.find((candidate) => {
          const label = normalize(candidate.route_label);
          const key = normalize(candidate.route_key);
          return candidates.some(
            (routeCandidate) =>
              label === routeCandidate ||
              key === routeCandidate ||
              label.startsWith(routeCandidate) ||
              label.endsWith(routeCandidate)
          );
        });

      if (row) {
        result[route.route_key] = {
          packages: Number(row.express.package_count ?? 0),
          open: Number(row.express.incomplete_package_count ?? 0),
          gaps: Number(row.express.tracking_gap_package_count ?? 0),
        };
      }
      return result;
    }, {});
  }, [expressRows, routeUnits]);

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
  const selectedExpress = selectedRoute
    ? expressByRouteKey[selectedRoute.route_key]
    : undefined;

  const arrivedPersonIds = useMemo(
    () => buildArrivedPersonIds(dispatchEvents),
    [dispatchEvents]
  );
  const selectedSeatPeople = selectedRoute
    ? selectedSeat === "driver"
      ? selectedRoute.driver
        ? [selectedRoute.driver]
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
      route.helpers.forEach((person) =>
        assignments.set(person.roster_member_id, { route, seat: "helper" })
      );
      route.trainees.forEach((person) =>
        assignments.set(person.roster_member_id, { route, seat: "trainee" })
      );
    });
    return assignments;
  }, [routeUnits]);

  async function togglePersonPresence(
    person: DispatchPerson,
    assignment?: { route: DispatchRoute; seat: Seat }
  ) {
    if (
      savingPresencePersonId ||
      dispatchDay?.status === "LOCKED"
    ) {
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
          route_label: assignment ? routeLabel(assignment.route) : null,
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
  }) {
    try {
      setSavingEvent(true);
      setError(null);
      let walkOnRosterId: string | null = null;
      const walkOnName = payload.walk_on_full_name?.trim();

      if (walkOnName) {
        const response = await fetch(`/api/company/${slug}/dispatch/walk-on`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            full_name: walkOnName,
            seen_date: serviceDate,
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
        dispatchDate: serviceDate,
        payload: {
          ...payload,
          event_code: walkOnName ? "ADD_DRIVER" : payload.event_code,
          event_label: walkOnName ? "Walk-on driver added" : payload.event_label,
          person_roster_member_id:
            walkOnRosterId || payload.person_roster_member_id,
          person_name: walkOnName || payload.person_name,
          route_key: payload.route_key ?? null,
          route_label: payload.route_label ?? null,
          event_payload: walkOnName
            ? {
                ...(payload.event_payload ?? {}),
                source: "dispatch_walk_on_driver",
                assignment_source: "WALK_ON",
                roster_member_id: walkOnRosterId,
              }
            : payload.event_payload ?? {},
        },
      });

      if (!ok) {
        setError(data?.error ?? "Failed to add dispatch event.");
        return;
      }
      if (data?.event) {
        setDispatchEvents((current) => [
          ...current,
          data.event as DispatchEventRow,
        ]);
      }
      if (data?.dispatch_day) setDispatchDay(data.dispatch_day);
      setEventOverlayOpen(false);
    } catch {
      setError("Failed to add dispatch event.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function handoffToDelivery() {
    if (handoffSaving || dispatchDay?.status === "LOCKED") return;

    try {
      setHandoffSaving(true);
      setError(null);
      const covered = routeUnits.filter((route) => route.driver).length;
      const snapshot = {
        service_date: serviceDate,
        locked_at: new Date().toISOString(),
        summary: {
          total: routeUnits.length,
          withDriver: covered,
          withoutDriver: routeUnits.length - covered,
          helpers: routeUnits.reduce(
            (total, route) => total + route.helpers.length,
            0
          ),
          trainees: routeUnits.reduce(
            (total, route) => total + route.trainees.length,
            0
          ),
        },
        routes: routeUnits,
        event_count: dispatchEvents.length,
        source: "operational_unit_action_overlay",
      };
      const { ok, data } = await lockDispatchDay({
        slug,
        dispatchDate: serviceDate,
        snapshotJson: snapshot,
      });
      if (!ok) {
        setError(data?.error ?? "Failed to hand the operation to Delivery.");
        return;
      }
      if (data?.dispatch_day) setDispatchDay(data.dispatch_day);
    } catch {
      setError("Failed to hand the operation to Delivery.");
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
            expressByRouteKey[route.route_key]?.gaps
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

  const routeFilters: Array<{ key: RouteFilter; label: string }> =
    dispatchDay?.status === "LOCKED"
      ? [
          { key: "all", label: "All" },
          { key: "on_route", label: "On route" },
          { key: "end_of_day", label: "End of day" },
        ]
      : [
          { key: "all", label: "All" },
          { key: "ready", label: "Ready" },
          { key: "awaiting", label: "Awaiting arrival" },
          { key: "unassigned", label: "Unassigned" },
        ];

  useEffect(() => {
    setRouteFilter("all");
  }, [dispatchDay?.status, horizon]);

  const visibleUnits = unitsWithPhase.filter(({ phase }) => {
    if (routeFilter === "all") return true;
    if (routeFilter === "ready") return phase === "ready";
    if (routeFilter === "awaiting") return phase === "awaiting_arrival";
    if (routeFilter === "unassigned") return phase === "needs_driver";
    if (routeFilter === "on_route") {
      return phase === "dispatched" || phase === "on_route";
    }
    return phase === "complete";
  });

  return (
    <main className="ou-shell">
      <header className="ou-header">
        <span>
          <small>Experimental operational workspace</small>
          <h1>Operations</h1>
          <p>{horizonCopy[horizon].question}</p>
        </span>

        <div className="ou-header-actions">
          {horizon === "operations" ? (
            <>
              <button
                type="button"
                className="ou-attendance-action"
                onClick={() => setAttendanceOpen(true)}
                disabled={dispatchDay?.status === "LOCKED"}
              >
                Attendance
              </button>
              <button
                type="button"
                className="ou-dispatch-action"
                onClick={() => setEventOverlayOpen(true)}
              >
                {dispatchDay?.status === "LOCKED"
                  ? "Delivery action"
                  : "Dispatch action"}
              </button>
            </>
          ) : null}
          <nav className="ou-lenses" aria-label="Operational horizon">
            {horizonOrder.map((key) => (
              <button
                type="button"
                key={key}
                className={horizon === key ? "is-active" : ""}
                onClick={() => setHorizon(key)}
              >
                {horizonCopy[key].label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {error ? <div className="ou-error">{error}</div> : null}

      <div className={`ou-layout ${selectedRoute ? "has-selection" : ""}`}>
        <section className="ou-collection" aria-label="Route operational units">
          <header>
            <span>
              <strong>Today’s route responsibilities</strong>
              <small>{routeUnits.length} operational units · {serviceDate}</small>
            </span>
          </header>

          {loading ? <p className="ou-empty">Loading operational units…</p> : null}

          {horizon === "operations" ? (
            <nav className="ou-route-filters" aria-label="Filter route responsibilities">
              {routeFilters.map((filter) => (
                <button
                  type="button"
                  key={filter.key}
                  className={routeFilter === filter.key ? "is-active" : ""}
                  onClick={() => setRouteFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </nav>
          ) : null}

          <div className="ou-grid">
            {visibleUnits.map(({ route, phase }) => (
              <RouteUnit
                key={route.route_key}
                route={route}
                selected={route.route_key === selectedRouteKey}
                horizon={horizon}
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
          <aside className="ou-workspace" aria-label={`${routeLabel(selectedRoute)} operational workspace`}>
            <header className="ou-workspace-header">
              <span>
                <small>Operational workspace</small>
                <h2>{routeLabel(selectedRoute)}</h2>
                <p>{personName(selectedRoute.driver)}</p>
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
              <Section title="Current responsibility">
                <dl className="ou-facts">
                  <div><dt>State</dt><dd>{selectedRoute.driver ? "Assigned" : "Needs driver"}</dd></div>
                  <div><dt>Horizon</dt><dd>{horizonCopy[horizon].label}</dd></div>
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
                        selectedRoute.driver?.roster_member_id ?? null
                      );
                    }}
                  >
                    <span><small>Driver</small><strong>{personName(selectedRoute.driver)}</strong></span>
                    <span>{selectedRoute.driver ? "Change" : "Assign"}</span>
                  </button>
                  {selectedPerson ? (
                    <button
                      type="button"
                      className={`ou-presence ${selectedPersonPresent ? "is-present" : ""}`}
                      onClick={toggleSelectedPersonPresence}
                      disabled={
                        Boolean(savingPresencePersonId) ||
                        dispatchDay?.status === "LOCKED"
                      }
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
                        {dispatchDay?.status === "LOCKED"
                          ? "Dispatch locked"
                          : savingPresencePersonId
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
                  <span>Express · {selectedExpress?.packages ?? "—"} packages · {selectedExpress?.open ?? "—"} open</span>
                </div>
              </Section>

              <Section title="Timeline">
                {selectedEvents.length ? (
                  <ol className="ou-timeline">
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
                  Seat-specific controls remain in this workspace. Use Dispatch action above for route, workforce, call-out, and note exceptions.
                </p>
              </Section>
            </div>
          </aside>
        ) : null}
      </div>

      <DispatchEventOverlay
        open={eventOverlayOpen}
        saving={savingEvent}
        eventTypes={eventTypes}
        scheduledWorkforce={allPeople}
        unscheduledDrivers={unscheduledDrivers}
        availableRoutes={availableRoutes}
        activeRoutes={routeUnits}
        phase={dispatchDay?.status === "LOCKED" ? "delivery" : "dispatch"}
        handoffSaving={handoffSaving}
        onHandoffToDelivery={handoffToDelivery}
        onClose={() => setEventOverlayOpen(false)}
        onSubmit={addManualDispatchEvent}
      />
      <AttendanceOverlay
        open={attendanceOpen}
        people={allPeople}
        arrivedPersonIds={arrivedPersonIds}
        assignmentByPersonId={assignmentByPersonId}
        locked={dispatchDay?.status === "LOCKED"}
        savingPersonId={savingPresencePersonId}
        onClose={() => setAttendanceOpen(false)}
        onToggle={(person, assignment) => {
          void togglePersonPresence(person, assignment);
        }}
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
        .ou-attendance-action {
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
        .ou-attendance-action:hover { border-color: #5369a8; background: #f6f8fd; }
        .ou-dispatch-action:disabled,
        .ou-attendance-action:disabled { cursor: not-allowed; opacity: .58; }
        .ou-lenses {
          display: inline-flex;
          padding: 4px;
          border: 1px solid #d8dee8;
          border-radius: 12px;
          background: #fff;
        }
        .ou-lenses button {
          border: 0;
          border-radius: 8px;
          background: transparent;
          padding: 9px 14px;
          color: #5d677a;
          font-weight: 800;
          cursor: pointer;
        }
        .ou-lenses button.is-active {
          background: #eff6ff;
          color: #1d4ed8;
          box-shadow: inset 0 0 0 1px #1d4ed8;
        }
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
          padding: 14px 16px;
          border-bottom: 1px solid #e7ebf1;
        }
        .ou-collection > header span { display: grid; gap: 2px; }
        .ou-collection > header small { color: #7a8495; }
        .ou-route-filters {
          display: flex;
          gap: 7px;
          padding: 10px 10px 0;
          overflow-x: auto;
        }
        .ou-route-filters button {
          flex: 0 0 auto;
          min-height: 32px;
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
          gap: 11px;
          padding: 13px;
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
        .ou-unit.phase-awaiting_arrival { --ou-signal: 194, 132, 36; --ou-posture: 194, 132, 36; }
        .ou-unit.phase-ready { --ou-signal: 48, 138, 84; --ou-posture: 48, 138, 84; }
        .ou-unit.phase-dispatched { --ou-signal: 63, 91, 158; --ou-posture: 48, 138, 84; }
        .ou-unit.phase-on_route { --ou-signal: 63, 91, 158; --ou-posture: 63, 91, 158; }
        .ou-unit.phase-complete { --ou-signal: 42, 122, 92; --ou-posture: 42, 122, 92; }
        .ou-unit.has-express-risk { --ou-signal: 217, 119, 34; }
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
          padding: 2px 0;
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
        button.ou-posture { cursor: pointer; }
        .ou-posture { color: rgb(var(--ou-posture)); }
        .ou-signal.normal { color: #24613c; }
        .ou-signal.caution { color: #8a5311; }
        .ou-unit.phase-needs_driver .ou-posture { color: #a32929; }
        .ou-signal.critical { background: #fce8e8; color: #9a3030; }
        .ou-assignment-line {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          padding: 1px 0;
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
        .ou-metric { display: grid; gap: 1px; padding: 8px; border-radius: 9px; background: #f5f7fa; }
        .ou-metric strong { font-size: 14px; }
        .ou-metric small { color: #7a8495; font-size: 9px; line-height: 1.2; }
        .ou-express-metric {
          border: 1px solid transparent;
          transition: border-color 150ms ease, background-color 150ms ease;
        }
        .ou-express-metric.has-express,
        .ou-express-metric.has-attention {
          border-color: rgba(255, 98, 0, .48);
          background:
            radial-gradient(circle at 100% 100%, rgba(255, 98, 0, .16), transparent 70%),
            #fffaf6;
        }
        .ou-express-metric.has-express strong,
        .ou-express-metric.has-attention strong { color: #b54708; }
        .ou-express-metric.has-express small,
        .ou-express-metric.has-attention small { color: #a74b16; }
        .ou-express-metric.is-muted {
          border-color: #edf0f4;
          background: #f4f5f7;
        }
        .ou-express-metric.is-muted strong,
        .ou-express-metric.is-muted small { color: #98a1af; }
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
        .ou-seat-note { margin: 9px 0 0; color: #7a8495; font-size: 12px; line-height: 1.4; }
        .ou-workspace-signals { display: grid; gap: 7px; }
        .ou-workspace-signals span { padding: 9px; border-radius: 9px; background: #f5f7fa; }
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
          .ou-lenses { display: grid; grid-template-columns: repeat(2, 1fr); }
          .ou-grid { grid-template-columns: 1fr; }
          .ou-workspace { inset: 0; border: 0; border-radius: 0; }
          .ou-workspace-body { max-height: calc(100vh - 100px); }
        }
      `}</style>
    </main>
  );
}
