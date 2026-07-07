"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  type AssignmentIntent,
  type DispatchDayRow,
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRoute,
  type Seat,
  cleanRouteKey,
  panel,
  todayIso,
} from "../lib/dispatchSupport";
import { addDaysIso } from "../lib/dispatchDates";
import {
  lockDispatchDay,
  recordDispatchEvent,
} from "../lib/dispatchApi";
import {
  buildAssignmentMapFromRoutesAndEvents,
  removePersonFromRoute,
} from "../lib/dispatchEventReducer";
import {
  buildArrivedPersonIds,
  buildHydratedRoutes,
  createRouteSorter,
  findUnscheduledDriverCandidates,
} from "../lib/dispatchSelectors";
import { buildDispatchWorkspaceModel } from "../lib/dispatchWorkspaceModel";
import { useDispatchWorkspaceData } from "../hooks/useDispatchWorkspaceData";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import OperationsIntelligenceFeed from "@/features/operations/components/OperationsIntelligenceFeed";
import OperationsUploadCard from "@/features/operations/components/OperationsUploadCard";
import { DispatchEventOverlay } from "../components/DispatchEventOverlay";
import { DispatchRightRail } from "../components/DispatchRightRail";
import { DispatchRouteQueue } from "../components/DispatchRouteQueue";
import { DispatchWorkforceRail } from "../components/DispatchWorkforceRail";

export default function DispatchPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [assignments, setAssignments] = useState<Record<string, DispatchRoute>>({});
  const [intent, setIntent] = useState<AssignmentIntent>(null);
  const [eventOverlayOpen, setEventOverlayOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [locking, setLocking] = useState(false);
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const persistedCalloutKeys = useRef(new Set<string>());

  const serviceDate = todayIso();
  const planningDate = addDaysIso(serviceDate, 1);
  const {
    dispatchDay,
    dispatchEvents,
    droPlanRows,
    droPlanSourceFrame,
    dswRows,
    error,
    eventTypes,
    lastUpdatedAt,
    loading,
    refreshKey,
    refreshWorkspace,
    rosterRows,
    routeSortKey,
    routes,
    scheduleRows,
    setDispatchDay,
    setDispatchEvents,
    setError,
  } = useDispatchWorkspaceData(slug, serviceDate);
  const dispatchLocked = dispatchDay?.status === "LOCKED";

  const arrivedPersonIds = useMemo(
    () => buildArrivedPersonIds(dispatchEvents),
    [dispatchEvents]
  );

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
    [routes, routeSort, scheduleRows, serviceDate]
  );

  useEffect(() => {
    setAssignments(buildAssignmentMapFromRoutesAndEvents(hydratedRoutes, dispatchEvents));
    setIntent(null);
  }, [hydratedRoutes, dispatchEvents]);

  const workspaceModel = useMemo(
    () =>
      buildDispatchWorkspaceModel({
        assignments,
        dispatchEvents,
        droPlanRows,
        dswRows,
        hydratedRoutes,
        planningDate,
        rosterRows,
        routeSort,
        routeSortKey,
        routes,
        scheduleRows,
        serviceDate,
      }),
    [
      assignments,
      dispatchEvents,
      droPlanRows,
      dswRows,
      hydratedRoutes,
      planningDate,
      rosterRows,
      routeSort,
      routeSortKey,
      routes,
      scheduleRows,
      serviceDate,
    ]
  );

  const {
    allPeople,
    availableRoutes,
    callouts,
    dispatchRoutes,
    dswSignalsByRouteKey,
    dswTotals,
    orderedRouteLabelForSort,
    planSignalsByRouteKey,
    planTotals,
    scheduledRosterIds,
    summary,
    unscheduledDrivers,
    workforce,
  } = workspaceModel;


  function openSeat(route: DispatchRoute, seat: Seat) {
    if (dispatchLocked) return;

    setIntent({
      route_key: route.route_key,
      route_label: orderedRouteLabelForSort(route),
      seat,
    });
  }

  async function recordAssignmentEvent(payload: {
    event_code: string;
    event_label: string;
    route_key: string;
    route_label: string;
    seat: Seat;
    person?: DispatchPerson | null;
  }) {
    try {
      const { ok, data } = await recordDispatchEvent({
        slug,
        dispatchDate: serviceDate,
        payload: {
          event_category: "ASSIGNMENT",
          event_code: payload.event_code,
          event_label: payload.event_label,
          route_key: payload.route_key,
          route_label: payload.route_label,
          to_route_key: payload.route_key,
          to_route_label: payload.route_label,
          seat: payload.seat,
          person_roster_member_id: payload.person?.roster_member_id ?? null,
          person_name: payload.person?.full_name ?? null,
          event_payload: {
            source: "dispatch_seat_edit",
          },
        },
      });

      if (!ok) {
        setError(data?.error ?? "Failed to record dispatch assignment.");
        return;
      }

      if (data?.event) {
        setDispatchEvents((current) => [...current, data.event as DispatchEventRow]);
      }

      if (data?.dispatch_day) {
        setDispatchDay(data.dispatch_day as DispatchDayRow);
      }
    } catch {
      setError("Failed to record dispatch assignment.");
    }
  }

  function assignPerson(person: DispatchPerson) {
    if (!intent || dispatchLocked) return;

    setAssignments((current) => {
      const target = current[intent.route_key];
      if (!target) return current;

      const next: Record<string, DispatchRoute> = {};

      for (const [key, route] of Object.entries(current)) {
        next[key] = removePersonFromRoute(route, person.roster_member_id);
      }

      const updatedTarget = next[intent.route_key];

      if (intent.seat === "driver") {
        if (updatedTarget.driver) {
          updatedTarget.extras = [...updatedTarget.extras, updatedTarget.driver];
        }
        updatedTarget.driver = person;
      }

      if (intent.seat === "helper") {
        updatedTarget.helpers = [...updatedTarget.helpers, person];
      }

      if (intent.seat === "trainee") {
        updatedTarget.trainees = [...updatedTarget.trainees, person];
      }

      next[intent.route_key] = updatedTarget;

      return next;
    });

    void recordAssignmentEvent({
      event_code:
        intent.seat === "driver"
          ? "ASSIGN_DRIVER"
          : intent.seat === "helper"
            ? "ASSIGN_HELPER"
            : "ASSIGN_TRAINEE",
      event_label:
        intent.seat === "driver"
          ? "Driver assigned"
          : intent.seat === "helper"
            ? "Helper assigned"
            : "Trainee assigned",
      route_key: intent.route_key,
      route_label: intent.route_label,
      seat: intent.seat,
      person,
    });

    setIntent(null);
  }

  function clearSeat(routeKey: string, seat: Seat) {
    if (dispatchLocked) return;

    setAssignments((current) => {
      const target = current[routeKey];
      if (!target) return current;

      const nextRoute: DispatchRoute = { ...target };

      if (seat === "driver") nextRoute.driver = null;
      if (seat === "helper") nextRoute.helpers = [];
      if (seat === "trainee") nextRoute.trainees = [];

      return {
        ...current,
        [routeKey]: nextRoute,
      };
    });

    const route = assignments[routeKey];
    const removedPerson =
      seat === "driver"
        ? route?.driver ?? null
        : seat === "helper"
          ? route?.helpers[0] ?? null
          : route?.trainees[0] ?? null;

    void recordAssignmentEvent({
      event_code:
        seat === "driver"
          ? "UNASSIGN_DRIVER"
          : seat === "helper"
            ? "UNASSIGN_HELPER"
            : "UNASSIGN_TRAINEE",
      event_label:
        seat === "driver"
          ? "Driver unassigned"
          : seat === "helper"
            ? "Helper unassigned"
            : "Trainee unassigned",
      route_key: routeKey,
      route_label: route ? orderedRouteLabelForSort(route) : routeKey,
      seat,
      person: removedPerson,
    });

    setIntent(null);
  }

  async function recordManualAction(payload: {
    event_code: string;
    event_label: string;
    event_category: string;
    note?: string;
    route_key?: string | null;
    route_label?: string | null;
    person_roster_member_id?: string | null;
    person_name?: string | null;
    event_payload?: Record<string, unknown>;
  }) {
    const { ok, data } = await recordDispatchEvent({
      slug,
      dispatchDate: serviceDate,
      payload: {
        route_key: payload.route_key ?? null,
        route_label: payload.route_label ?? null,
        event_code: payload.event_code,
        event_label: payload.event_label,
        event_category: payload.event_category,
        note: payload.note ?? "",
        person_roster_member_id: payload.person_roster_member_id ?? null,
        person_name: payload.person_name ?? null,
        event_payload: payload.event_payload ?? {},
      },
    });

    if (!ok) {
      setError(data?.error ?? "Failed to record dispatch action.");
      return null;
    }

    if (data?.event) {
      setDispatchEvents((current) => [...current, data.event as DispatchEventRow]);
    }

    if (data?.dispatch_day) {
      setDispatchDay(data.dispatch_day as DispatchDayRow);
    }

    return data;
  }

  async function handleAddRoute() {
    if (dispatchLocked) return;

    const rawRoute = window.prompt("Route / WA number to add");
    const routeName = rawRoute?.trim();

    if (!routeName) return;

    const routeKey = cleanRouteKey(routeName);

    if (assignments[routeKey]) {
      setError("That route is already on the dispatch board.");
      return;
    }

    try {
      setSavingEvent(true);
      setError(null);

      await recordManualAction({
        event_code: "ADD_ROUTE",
        event_label: "Route added",
        event_category: "ROUTE",
        route_key: routeKey,
        route_label: routeName,
        note: "Route manually added to dispatch day.",
        event_payload: {
          route_name: routeName,
          current_wa_num: routeName,
          route_type: "ADDED",
          source: "dispatch_manual_add_route",
        },
      });
    } catch {
      setError("Failed to add route.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleAddDriver() {
    if (dispatchLocked) return;

    const candidates = findUnscheduledDriverCandidates({
      allPeople,
      rosterRows,
      scheduledRosterIds,
    });

    if (candidates.length === 0) {
      setError("No off-schedule roster drivers are available to add.");
      return;
    }

    const search = window.prompt(
      `Search driver to add. Available: ${candidates
        .slice(0, 8)
        .map((row) => row.full_name)
        .filter(Boolean)
        .join(", ")}${candidates.length > 8 ? ", ..." : ""}`
    );

    const needle = search?.trim().toLowerCase();
    if (!needle) return;

    const matches = candidates.filter((row) =>
      `${row.full_name ?? ""} ${row.worker_type ?? ""}`.toLowerCase().includes(needle)
    );

    if (matches.length !== 1) {
      setError(
        matches.length === 0
          ? "No matching off-schedule driver found."
          : "Multiple drivers matched. Use a more specific search."
      );
      return;
    }

    const driver = matches[0];

    try {
      setSavingEvent(true);
      setError(null);

      await recordManualAction({
        event_code: "ADD_DRIVER",
        event_label: "Driver added",
        event_category: "WORKFORCE",
        person_roster_member_id: driver.roster_member_id,
        person_name: driver.full_name?.trim() || "Unnamed driver",
        note: "Driver manually added to dispatch day.",
        event_payload: {
          worker_type: driver.worker_type,
          source: "dispatch_manual_add_driver",
        },
      });
    } catch {
      setError("Failed to add driver.");
    } finally {
      setSavingEvent(false);
    }
  }

  const addManualDispatchEvent = useCallback(async (payload: {
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
  }) => {
    try {
      setSavingEvent(true);
      setError(null);

      let walkOnRosterId: string | null = null;
      const walkOnName = payload.walk_on_full_name?.trim();

      if (walkOnName) {
        const walkOnRes = await fetch(`/api/company/${slug}/dispatch/walk-on`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            full_name: walkOnName,
            seen_date: serviceDate,
          }),
        });

        const walkOnData = await walkOnRes.json().catch(() => ({}));

        if (!walkOnRes.ok) {
          setError(walkOnData?.error ?? "Failed to save walk-on driver.");
          return;
        }

        walkOnRosterId =
          typeof walkOnData?.roster_member_id === "string"
            ? walkOnData.roster_member_id
            : null;
      }

      const { ok, data } = await recordDispatchEvent({
        slug,
        dispatchDate: serviceDate,
        payload: {
          ...payload,
          event_code: walkOnName ? "ADD_DRIVER" : payload.event_code,
          event_label: walkOnName ? "Walk-on driver added" : payload.event_label,
          person_roster_member_id: walkOnRosterId || payload.person_roster_member_id,
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
        setDispatchEvents((current) => [...current, data.event as DispatchEventRow]);
      }

      if (data?.dispatch_day) {
        setDispatchDay(data.dispatch_day as DispatchDayRow);
      }

      setEventOverlayOpen(false);
    } catch {
      setError("Failed to add dispatch event.");
    } finally {
      setSavingEvent(false);
    }
  }, [serviceDate, setDispatchDay, setDispatchEvents, setError, slug]);

  async function toggleArrived(person: DispatchPerson) {
    if (dispatchLocked) return;

    const arrived = arrivedPersonIds.has(person.roster_member_id);

    await addManualDispatchEvent({
      event_code: arrived ? "UNDO_ARRIVED" : "ARRIVED",
      event_label: arrived ? "Undo arrived" : "Arrived",
      event_category: "WORKFORCE",
      note: arrived ? "Arrival verification removed." : "Arrival verified.",
      person_roster_member_id: person.roster_member_id,
      person_name: person.full_name,
      event_payload: {
        source: "manual_arrival_toggle",
        arrived: !arrived,
      },
    });
  }

  useEffect(() => {
    if (!slug || dispatchLocked || callouts.length === 0) return;

    const existingCalloutIds = new Set(
      dispatchEvents
        .filter((event) => event.event_code === "CALL_OUT")
        .map((event) => event.person_roster_member_id)
        .filter(Boolean)
    );

    for (const person of callouts) {
      const key = `${serviceDate}:${person.roster_member_id}`;
      if (existingCalloutIds.has(person.roster_member_id)) continue;
      if (persistedCalloutKeys.current.has(key)) continue;

      persistedCalloutKeys.current.add(key);

      void addManualDispatchEvent({
        event_code: "CALL_OUT",
        event_label: "Driver call-out",
        event_category: "ATTENDANCE",
        note: "Imported from schedule call-out override.",
        person_roster_member_id: person.roster_member_id,
        person_name: person.full_name,
      });
    }
  }, [addManualDispatchEvent, callouts, dispatchEvents, dispatchLocked, serviceDate, slug]);


  async function undoDispatchEvent(event: DispatchEventRow) {
    if (dispatchLocked) return;

    try {
      setSavingEvent(true);
      setError(null);

      await addManualDispatchEvent({
        event_code: `UNDO_${event.event_code}`,
        event_label: `Undo ${event.event_label}`,
        event_category: event.event_category,
        note: `Reversed dispatch action: ${event.event_label}.`,
        person_roster_member_id: event.person_roster_member_id,
        person_name: event.person_name,
        route_key: event.route_key,
        route_label: event.route_label,
        event_payload: {
          source: "dispatch_action_undo",
          reverses_event_id: event.id,
          reverses_event_code: event.event_code,
        },
      });
    } catch {
      setError("Failed to undo dispatch action.");
    } finally {
      setSavingEvent(false);
    }
  }


  async function lockDispatch() {
    try {
      setLocking(true);
      setError(null);

      const snapshot = {
        service_date: serviceDate,
        locked_at: new Date().toISOString(),
        summary,
        routes: dispatchRoutes,
        event_count: dispatchEvents.length,
        report: {
          title: "Dispatch Lock Report",
          routes_total: summary.total,
          routes_covered: summary.withDriver,
          routes_needing_driver: summary.withoutDriver,
          helpers_assigned: summary.helpers,
          trainees_assigned: summary.trainees,
          available_workers: summary.available,
        },
      };

      const { ok, data } = await lockDispatchDay({
        slug,
        dispatchDate: serviceDate,
        snapshotJson: snapshot,
      });

      if (!ok) {
        setError(data?.error ?? "Failed to lock dispatch.");
        return;
      }

      if (data?.dispatch_day) {
        setDispatchDay(data.dispatch_day as DispatchDayRow);
      }
    } catch {
      setError("Failed to lock dispatch.");
    } finally {
      setLocking(false);
    }
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main"
        style={{
          paddingTop: 0,
        }}>


        <OperationsWorkspaceToolbar
          lastUpdatedAt={lastUpdatedAt}
          refreshing={loading}
          onRefresh={refreshWorkspace}
        />

        {error ? (
          <section style={{ ...panel, padding: 12, marginTop: 10 }}>
            <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
          </section>
        ) : null}

        <section className="dispatch-grid">
            <DispatchWorkforceRail
              allPeopleCount={allPeople.length}
              availableCount={summary.available}
              intent={intent}
              availablePeople={workforce.available}
              callouts={callouts}
              arrivedPersonIds={arrivedPersonIds}
              onToggleArrived={toggleArrived}
              onCancelAssign={() => setIntent(null)}
              onSelectPerson={assignPerson}
            />

            <DispatchRouteQueue
              routeLabelForDisplay={orderedRouteLabelForSort}
              routes={dispatchRoutes}
              totalRoutes={summary.total}
              loading={loading}
              intent={intent}
              onOpenSeat={openSeat}
              onClearSeat={clearSeat}
              onCancelIntent={() => setIntent(null)}
              arrivedPersonIds={arrivedPersonIds}
              onToggleArrived={toggleArrived}
              planSignalsByRouteKey={planSignalsByRouteKey}
              dswSignalsByRouteKey={dswSignalsByRouteKey}
              planTotals={planTotals}
              dswTotals={dswTotals}
              planSourceLabel={droPlanSourceFrame ? `${droPlanSourceFrame} DRO` : null}
            />

            <div style={{ display: "grid", gap: 12 }}>
              {!dispatchLocked ? (
                <OperationsUploadCard onUpload={() => setUploadOverlayOpen(true)} />
              ) : null}

              <OperationsIntelligenceFeed
                key={`dispatch-feed-${refreshKey}-${dispatchLocked ? "locked" : "open"}`}
                slug={slug}
                serviceDate={serviceDate}
                surface="dispatch"
                frozen={dispatchLocked}
              />
              <DispatchRightRail
                summary={summary}
                dispatchRoutes={dispatchRoutes}
                dispatchDay={dispatchDay}
                events={dispatchEvents}
                locking={locking}
                onAddEvent={() => setEventOverlayOpen(true)}
                onUndoEvent={undoDispatchEvent}
                onLockDispatch={lockDispatch}
              />
            </div>
          </section>
      </section>


      <OperationsReportUploadOverlay
        open={uploadOverlayOpen}
        onClose={(shouldRefresh) => {
          setUploadOverlayOpen(false);
          if (shouldRefresh) refreshWorkspace();
        }}
      />

      <DispatchEventOverlay
        open={eventOverlayOpen}
        saving={savingEvent}
        eventTypes={eventTypes}
        scheduledWorkforce={allPeople}
        unscheduledDrivers={unscheduledDrivers}
        availableRoutes={availableRoutes}
        activeRoutes={dispatchRoutes}
        onClose={() => setEventOverlayOpen(false)}
        onSubmit={addManualDispatchEvent}
      />
    </main>
  );
}
