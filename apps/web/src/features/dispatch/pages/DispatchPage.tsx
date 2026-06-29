"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  type AssignmentIntent,
  type DispatchDayRow,
  type DispatchEventRow,
  type DispatchEventTypeRow,
  type DispatchPerson,
  type DispatchRosterRow,
  type DispatchRoute,
  type GeneratedScheduleRow,
  type RouteRow,
  type Seat,
  cleanRouteKey,
  panel,
  todayIso,
} from "../lib/dispatchSupport";
import { addDaysIso, isoDateOffset } from "../lib/dispatchDates";
import {
  buildAssignmentMapFromRoutesAndEvents,
  removePersonFromRoute,
} from "../lib/dispatchEventReducer";
import {
  buildAllPeople,
  buildArrivedPersonIds,
  buildAssignedIds,
  buildAvailableRoutes,
  buildCallouts,
  buildDispatchSummary,
  buildDroPlanByWa,
  buildHydratedRoutes,
  buildPlanningRoutes,
  buildScheduledRosterIds,
  buildUnscheduledDrivers,
  buildWorkforce,
  createRouteSorter,
  findUnscheduledDriverCandidates,
  orderedRouteLabel,
} from "../lib/dispatchSelectors";
import { buildDroPlanSignals, type DroPlanRow } from "../lib/droPlanSignals";
import {
  buildDswDispatchSignals,
  type DswCurrentRow,
} from "../lib/dswDispatchSignals";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import OperationsIntelligenceFeed from "@/features/operations/components/OperationsIntelligenceFeed";
import { DispatchEventOverlay } from "../components/DispatchEventOverlay";
import { DispatchRightRail } from "../components/DispatchRightRail";
import { DispatchRouteQueue } from "../components/DispatchRouteQueue";
import { DispatchWorkforceRail } from "../components/DispatchWorkforceRail";

export default function DispatchPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [scheduleRows, setScheduleRows] = useState<GeneratedScheduleRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [rosterRows, setRosterRows] = useState<DispatchRosterRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, DispatchRoute>>({});
  const [intent, setIntent] = useState<AssignmentIntent>(null);
  const [dispatchDay, setDispatchDay] = useState<DispatchDayRow | null>(null);
  const [dispatchEvents, setDispatchEvents] = useState<DispatchEventRow[]>([]);
  const [eventTypes, setEventTypes] = useState<DispatchEventTypeRow[]>([]);
  const [eventOverlayOpen, setEventOverlayOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [locking, setLocking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [droPlanRows, setDroPlanRows] = useState<DroPlanRow[]>([]);
  const [dswRows, setDswRows] = useState<DswCurrentRow[]>([]);
  const [droPlanSourceFrame, setDroPlanSourceFrame] = useState<"AM" | "PM" | null>(null);
  const persistedCalloutKeys = useRef(new Set<string>());

  const serviceDate = todayIso();
  const planningDate = addDaysIso(serviceDate, 1);
  const dispatchLocked = dispatchDay?.status === "LOCKED";

  const arrivedPersonIds = useMemo(
    () => buildArrivedPersonIds(dispatchEvents),
    [dispatchEvents]
  );

  const [routeSortKey, setRouteSortKey] =
    useState<"route_name" | "current_wa_num">("route_name");
  const routeSort = useMemo(
    () => createRouteSorter(routeSortKey),
    [routeSortKey]
  );

  
  const droPlanByWa = useMemo(
    () => buildDroPlanByWa(droPlanRows),
    [droPlanRows]
  );



  const orderedRouteLabelForSort = useCallback(
    (route: DispatchRoute) => orderedRouteLabel(route, routeSortKey),
    [routeSortKey]
  );

  useEffect(() => {
    let active = true;

    async function loadDispatchInputs() {
      try {
        setLoading(true);
        setError(null);

        const droPlanServiceDate = isoDateOffset(serviceDate, -1);

        const [
          scheduleRes,
          routesRes,
          rosterRes,
          dispatchDayRes,
          eventTypesRes,
          operationsConfigRes,
          amDroPlanRes,
          pmDroPlanRes,
          dswCurrentRes,
        ] = await Promise.all([
          fetch(`/api/company/${slug}/schedule/generated?date=${serviceDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/routes`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/people/roster`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/dispatch/day?date=${serviceDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/dispatch/event-types`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/config/operations`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/operations/reports/dro-plan?date=${serviceDate}&frame=AM`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/operations/reports/dro-plan?date=${droPlanServiceDate}&frame=PM`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const [
          scheduleData,
          routesData,
          rosterData,
          dispatchDayData,
          eventTypesData,
          operationsConfigData,
          amDroPlanData,
          pmDroPlanData,
          dswCurrentData,
        ] = await Promise.all([
          scheduleRes.json(),
          routesRes.json(),
          rosterRes.json(),
          dispatchDayRes.json(),
          eventTypesRes.json(),
          operationsConfigRes.json(),
          amDroPlanRes.json(),
          pmDroPlanRes.json(),
          dswCurrentRes.json(),
        ]);

        if (!active) return;

        if (!scheduleRes.ok) {
          setError(scheduleData?.error ?? "Failed to load generated schedule.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!routesRes.ok) {
          setError(routesData?.error ?? "Failed to load routes.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!rosterRes.ok) {
          setError(rosterData?.error ?? "Failed to load roster.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!dispatchDayRes.ok) {
          setError(dispatchDayData?.error ?? "Failed to load dispatch day.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!eventTypesRes.ok) {
          setError(eventTypesData?.error ?? "Failed to load dispatch event types.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        const amDroRows = amDroPlanRes.ok ? amDroPlanData?.rows ?? [] : [];
        const pmDroRows = pmDroPlanRes.ok ? pmDroPlanData?.rows ?? [] : [];

        setDroPlanRows(amDroRows.length > 0 ? amDroRows : pmDroRows);
        setDswRows(dswCurrentRes.ok ? dswCurrentData?.rows ?? [] : []);
        setDroPlanSourceFrame(
          amDroRows.length > 0
            ? "AM"
            : pmDroRows.length > 0
              ? "PM"
              : null
        );

        setRouteSortKey(
          operationsConfigData?.config?.route_sort_key === "current_wa_num"
            ? "current_wa_num"
            : "route_name"
        );

        setScheduleRows((scheduleData?.rows ?? []) as GeneratedScheduleRow[]);
        setRoutes((routesData?.routes ?? []) as RouteRow[]);
        setRosterRows((rosterData?.roster ?? []) as DispatchRosterRow[]);
        setDispatchDay((dispatchDayData?.dispatch_day ?? null) as DispatchDayRow | null);
        setDispatchEvents((dispatchDayData?.events ?? []) as DispatchEventRow[]);
        setEventTypes((eventTypesData?.event_types ?? []) as DispatchEventTypeRow[]);
        setLastUpdatedAt(new Date().toISOString());
      } catch {
        if (!active) return;
        setError("Dispatch hydration failed.");
        setScheduleRows([]);
        setRoutes([]);
        setRosterRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) loadDispatchInputs();

    return () => {
      active = false;
    };
  }, [refreshKey, serviceDate, slug]);

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

  const dispatchRoutes = useMemo(
    () => Object.values(assignments).sort(routeSort),
    [assignments, routeSort]
  );

  const { planSignalsByRouteKey, planTotals } = useMemo(
    () => buildDroPlanSignals(dispatchRoutes, droPlanRows),
    [dispatchRoutes, droPlanRows]
  );

  const { dswSignalsByRouteKey, dswTotals } = useMemo(
    () => buildDswDispatchSignals(dispatchRoutes, dswRows),
    [dispatchRoutes, dswRows]
  );

  const scheduledRosterIds = useMemo(
    () => buildScheduledRosterIds(scheduleRows, serviceDate),
    [scheduleRows, serviceDate]
  );

  const allPeople = useMemo(
    () =>
      buildAllPeople({
        scheduleRows,
        dispatchEvents,
        serviceDate,
      }),
    [dispatchEvents, scheduleRows, serviceDate]
  );

  const callouts = useMemo(
    () =>
      buildCallouts({
        scheduleRows,
        dispatchEvents,
        serviceDate,
      }),
    [dispatchEvents, scheduleRows, serviceDate]
  );

  const calloutIds = useMemo(
    () => new Set(callouts.map((person) => person.roster_member_id)),
    [callouts]
  );

  const assignedIds = useMemo(
    () => buildAssignedIds(dispatchRoutes, hydratedRoutes),
    [dispatchRoutes, hydratedRoutes]
  );

  const workforce = useMemo(
    () =>
      buildWorkforce({
        allPeople,
        assignedIds,
        calloutIds,
      }),
    [allPeople, assignedIds, calloutIds]
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
        dispatchRoutes,
        routes,
        routeSort,
      }),
    [dispatchRoutes, routeSort, routes]
  );

  const planningRoutes = useMemo(
    () =>
      buildPlanningRoutes({
        droPlanRows,
        planningDate,
        routeSort,
        routes,
      }),
    [droPlanRows, planningDate, routeSort, routes]
  );

  const summary = useMemo(
    () => buildDispatchSummary(dispatchRoutes, workforce.available.length),
    [dispatchRoutes, workforce.available.length]
  );


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
      const res = await fetch(`/api/company/${slug}/dispatch/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dispatch_date: serviceDate,
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
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
    const res = await fetch(`/api/company/${slug}/dispatch/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        dispatch_date: serviceDate,
        route_key: payload.route_key ?? null,
        route_label: payload.route_label ?? null,
        event_code: payload.event_code,
        event_label: payload.event_label,
        event_category: payload.event_category,
        note: payload.note ?? "",
        person_roster_member_id: payload.person_roster_member_id ?? null,
        person_name: payload.person_name ?? null,
        event_payload: payload.event_payload ?? {},
      }),
    });

    const data = await res.json();

    if (!res.ok) {
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
  }) => {
    try {
      setSavingEvent(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/dispatch/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dispatch_date: serviceDate,
          ...payload,
          route_key: payload.route_key ?? null,
          route_label: payload.route_label ?? null,
          event_payload: payload.event_payload ?? {},
        }),
      });

      const data = await res.json();

      if (!res.ok) {
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
  }, [serviceDate, slug]);

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

      const res = await fetch(`/api/company/${slug}/dispatch/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dispatch_date: serviceDate,
          snapshot_json: snapshot,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
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
          onRefresh={() => setRefreshKey((current) => current + 1)}
          onUpload={() => setUploadOverlayOpen(true)}
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
          if (shouldRefresh) setRefreshKey((current) => current + 1);
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
