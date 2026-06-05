"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  type AssignmentIntent,
  type DispatchDayRow,
  type DispatchEventRow,
  type DispatchEventTypeRow,
  type DispatchPerson,
  type DispatchRoute,
  type GeneratedScheduleRow,
  type RouteRow,
  type Seat,
  classifyPerson,
  cleanRouteKey,
  compactButton,
  eyebrow,
  panel,
  panelHeader,
  personFromRow,
  personSort,
  personTypeLabel,
  routeLabel,
  routeRowBase,
  seatButtonBase,
  selectedButton,
  todayIso,
  todayRunFlag,
} from "../lib/dispatchSupport";
import { DispatchEventOverlay } from "../components/DispatchEventOverlay";
import { DispatchRightRail } from "../components/DispatchRightRail";
import { DispatchRouteQueue } from "../components/DispatchRouteQueue";
import { DispatchWorkforceRail } from "../components/DispatchWorkforceRail";

export default function DispatchPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [scheduleRows, setScheduleRows] = useState<GeneratedScheduleRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, DispatchRoute>>({});
  const [intent, setIntent] = useState<AssignmentIntent>(null);
  const [dispatchDay, setDispatchDay] = useState<DispatchDayRow | null>(null);
  const [dispatchEvents, setDispatchEvents] = useState<DispatchEventRow[]>([]);
  const [eventTypes, setEventTypes] = useState<DispatchEventTypeRow[]>([]);
  const [eventOverlayOpen, setEventOverlayOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [locking, setLocking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serviceDate = todayIso();

  useEffect(() => {
    let active = true;

    async function loadDispatchInputs() {
      try {
        setLoading(true);
        setError(null);

        const [scheduleRes, routesRes, dispatchDayRes, eventTypesRes] = await Promise.all([
          fetch(`/api/company/${slug}/schedule/generated`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/routes`, {
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
        ]);

        const [scheduleData, routesData, dispatchDayData, eventTypesData] = await Promise.all([
          scheduleRes.json(),
          routesRes.json(),
          dispatchDayRes.json(),
          eventTypesRes.json(),
        ]);

        if (!active) return;

        if (!scheduleRes.ok) {
          setError(scheduleData?.error ?? "Failed to load generated schedule.");
          setScheduleRows([]);
          setRoutes([]);
          return;
        }

        if (!routesRes.ok) {
          setError(routesData?.error ?? "Failed to load routes.");
          setScheduleRows([]);
          setRoutes([]);
          return;
        }

        if (!dispatchDayRes.ok) {
          setError(dispatchDayData?.error ?? "Failed to load dispatch day.");
          setScheduleRows([]);
          setRoutes([]);
          return;
        }

        if (!eventTypesRes.ok) {
          setError(eventTypesData?.error ?? "Failed to load dispatch event types.");
          setScheduleRows([]);
          setRoutes([]);
          return;
        }

        setScheduleRows((scheduleData?.rows ?? []) as GeneratedScheduleRow[]);
        setRoutes((routesData?.routes ?? []) as RouteRow[]);
        setDispatchDay((dispatchDayData?.dispatch_day ?? null) as DispatchDayRow | null);
        setDispatchEvents((dispatchDayData?.events ?? []) as DispatchEventRow[]);
        setEventTypes((eventTypesData?.event_types ?? []) as DispatchEventTypeRow[]);
      } catch {
        if (!active) return;
        setError("Dispatch hydration failed.");
        setScheduleRows([]);
        setRoutes([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) loadDispatchInputs();

    return () => {
      active = false;
    };
  }, [serviceDate, slug]);

  const hydratedRoutes = useMemo(() => {
    const runFlag = todayRunFlag();
    const routeMap = new Map<string, DispatchRoute>();

    for (const route of routes) {
      if (!route[runFlag as keyof RouteRow]) continue;

      const key = cleanRouteKey(route.current_wa_num || route.route_name);

      routeMap.set(key, {
        route_key: key,
        route_name: route.route_name?.trim() || key,
        current_wa_num: route.current_wa_num,
        route_location: route.route_location,
        route_type: route.route_type,
        driver: null,
        helpers: [],
        trainees: [],
        extras: [],
      });
    }

    for (const row of scheduleRows) {
      if (row.service_date !== serviceDate || !row.planned_on) continue;

      const key = cleanRouteKey(row.route_name);

      if (!routeMap.has(key)) {
        routeMap.set(key, {
          route_key: key,
          route_name: key,
          current_wa_num: null,
          route_location: null,
          route_type: null,
          driver: null,
          helpers: [],
          trainees: [],
          extras: [],
        });
      }

      const route = routeMap.get(key);
      if (!route) continue;

      const person = personFromRow(row);
      const seat = classifyPerson(row);

      if (seat === "helper") {
        route.helpers.push(person);
      } else if (seat === "trainee") {
        route.trainees.push(person);
      } else if (!route.driver) {
        route.driver = person;
      } else {
        route.extras.push(person);
      }
    }

    return Array.from(routeMap.values()).sort((a, b) =>
      routeLabel(a).localeCompare(routeLabel(b), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  }, [routes, scheduleRows, serviceDate]);

  useEffect(() => {
    const next: Record<string, DispatchRoute> = {};
    for (const route of hydratedRoutes) {
      next[route.route_key] = {
        ...route,
        helpers: [...route.helpers],
        trainees: [...route.trainees],
        extras: [...route.extras],
      };
    }
    setAssignments(next);
    setIntent(null);
  }, [hydratedRoutes]);

  const dispatchRoutes = useMemo(
    () =>
      Object.values(assignments).sort((a, b) =>
        routeLabel(a).localeCompare(routeLabel(b), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
    [assignments]
  );

  const allPeople = useMemo(() => {
    const byId = new Map<string, DispatchPerson>();

    for (const row of scheduleRows) {
      if (row.service_date !== serviceDate || !row.planned_on) continue;
      const person = personFromRow(row);
      byId.set(person.roster_member_id, person);
    }

    return Array.from(byId.values()).sort(personSort);
  }, [scheduleRows, serviceDate]);

  const assignedIds = useMemo(() => {
    const ids = new Set<string>();

    for (const route of dispatchRoutes) {
      if (route.driver) ids.add(route.driver.roster_member_id);
      for (const person of route.helpers) ids.add(person.roster_member_id);
      for (const person of route.trainees) ids.add(person.roster_member_id);
      for (const person of route.extras) ids.add(person.roster_member_id);
    }

    return ids;
  }, [dispatchRoutes]);

  const workforce = useMemo(() => {
    const available = allPeople.filter((person) => !assignedIds.has(person.roster_member_id));
    const drivers = allPeople.filter((person) => {
      const label = personTypeLabel(person).toLowerCase();
      return !label.includes("helper") && !label.includes("trainee");
    });
    const helpers = allPeople.filter((person) =>
      personTypeLabel(person).toLowerCase().includes("helper")
    );
    const trainees = allPeople.filter((person) =>
      personTypeLabel(person).toLowerCase().includes("trainee")
    );

    return {
      available,
      drivers,
      helpers,
      trainees,
    };
  }, [allPeople, assignedIds]);

  const summary = useMemo(() => {
    const total = dispatchRoutes.length;
    const withDriver = dispatchRoutes.filter((route) => route.driver).length;
    const withoutDriver = total - withDriver;
    const helpers = dispatchRoutes.reduce((sum, route) => sum + route.helpers.length, 0);
    const trainees = dispatchRoutes.reduce((sum, route) => sum + route.trainees.length, 0);

    return {
      total,
      withDriver,
      withoutDriver,
      helpers,
      trainees,
      available: workforce.available.length,
    };
  }, [dispatchRoutes, workforce.available.length]);

  const dispatchLocked = dispatchDay?.status === "LOCKED";

  function openSeat(route: DispatchRoute, seat: Seat) {
    if (dispatchLocked) return;

    setIntent({
      route_key: route.route_key,
      route_label: routeLabel(route),
      seat,
    });
  }

  function assignPerson(person: DispatchPerson) {
    if (!intent || dispatchLocked) return;

    setAssignments((current) => {
      const target = current[intent.route_key];
      if (!target) return current;

      const removePerson = (route: DispatchRoute): DispatchRoute => ({
        ...route,
        driver:
          route.driver?.roster_member_id === person.roster_member_id
            ? null
            : route.driver,
        helpers: route.helpers.filter(
          (item) => item.roster_member_id !== person.roster_member_id
        ),
        trainees: route.trainees.filter(
          (item) => item.roster_member_id !== person.roster_member_id
        ),
        extras: route.extras.filter(
          (item) => item.roster_member_id !== person.roster_member_id
        ),
      });

      const next: Record<string, DispatchRoute> = {};

      for (const [key, route] of Object.entries(current)) {
        next[key] = removePerson(route);
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

    setIntent(null);
  }

  async function addManualDispatchEvent(payload: {
    event_code: string;
    event_label: string;
    event_category: string;
    note: string;
    person_roster_member_id: string | null;
    person_name: string | null;
  }) {
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
      <section className="workspace-main">
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">Dispatch</p>
            <h1 className="workspace-title">Today&apos;s Operation</h1>
            <p className="workspace-subtitle">
              Assign drivers, helpers, and trainees while preserving the final dispatch shape for reporting.
            </p>
          </div>

          <div className="context-grid">
            <div className="context-stat">
              <span className="context-stat__label">Service date</span>
              <strong>{serviceDate}</strong>
            </div>
            <div className="context-stat">
              <span className="context-stat__label">State</span>
              <strong>{dispatchLocked ? "Locked" : "Active Draft"}</strong>
            </div>
            <div className="context-stat">
              <span className="context-stat__label">Routes</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="context-stat">
              <span className="context-stat__label">Needs Driver</span>
              <strong style={{ color: summary.withoutDriver ? "#b54708" : "#166534" }}>
                {summary.withoutDriver}
              </strong>
            </div>
          </div>
        </header>

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
          onCancelAssign={() => setIntent(null)}
          onSelectPerson={assignPerson}
        />

        <DispatchRouteQueue
          routes={dispatchRoutes}
          totalRoutes={summary.total}
          loading={loading}
          intent={intent}
          onOpenSeat={openSeat}
          onClearSeat={clearSeat}
          onCancelIntent={() => setIntent(null)}
        />

        <DispatchRightRail
          summary={summary}
          dispatchRoutes={dispatchRoutes}
          dispatchDay={dispatchDay}
          events={dispatchEvents}
          locking={locking}
          onAddEvent={() => setEventOverlayOpen(true)}
          onLockDispatch={lockDispatch}
        />
        </section>
      </section>

      <DispatchEventOverlay
        open={eventOverlayOpen}
        saving={savingEvent}
        eventTypes={eventTypes}
        workforce={allPeople}
        onClose={() => setEventOverlayOpen(false)}
        onSubmit={addManualDispatchEvent}
      />
    </main>
  );
}
