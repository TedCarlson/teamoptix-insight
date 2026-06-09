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
  classifyPerson,
  cleanRouteKey,
  compactButton,
  eyebrow,
  getReversedDispatchEventIds,
  panel,
  panelHeader,
  personFromRow,
  personSort,
  personTypeLabel,
  routeLabel,
  routeRowBase,
  seatButtonBase,
  selectedButton,
  runFlagForDate,
  todayIso,
} from "../lib/dispatchSupport";
import { DispatchEventOverlay } from "../components/DispatchEventOverlay";
import { DispatchRightRail } from "../components/DispatchRightRail";
import { DispatchRouteQueue } from "../components/DispatchRouteQueue";
import { DispatchWorkforceRail } from "../components/DispatchWorkforceRail";

function dispatchPersonFromEvent(event: DispatchEventRow): DispatchPerson | null {
  if (!event.person_roster_member_id || !event.person_name) return null;

  return {
    roster_member_id: event.person_roster_member_id,
    full_name: event.person_name,
    worker_type: null,
    source_kind: "DISPATCH_EVENT",
    override_type: null,
  };
}

function removePersonFromRoute(route: DispatchRoute, rosterMemberId: string): DispatchRoute {
  return {
    ...route,
    driver:
      route.driver?.roster_member_id === rosterMemberId ? null : route.driver,
    helpers: route.helpers.filter((person) => person.roster_member_id !== rosterMemberId),
    trainees: route.trainees.filter((person) => person.roster_member_id !== rosterMemberId),
    extras: route.extras.filter((person) => person.roster_member_id !== rosterMemberId),
  };
}

function applyDispatchEvent(
  current: Record<string, DispatchRoute>,
  event: DispatchEventRow
): Record<string, DispatchRoute> {
  const code = event.event_code;
  const routeKey = event.route_key ?? event.to_route_key ?? null;
  const seat = event.seat as Seat | null;
  const person = dispatchPersonFromEvent(event);

  if (code === "ADD_ROUTE") {
    if (!routeKey) return current;
    if (current[routeKey]) return current;

    const payload = event.event_payload ?? {};

    return {
      ...current,
      [routeKey]: {
        route_key: routeKey,
        route_name:
          typeof payload.route_name === "string"
            ? payload.route_name
            : event.route_label ?? routeKey,
        current_wa_num:
          typeof payload.current_wa_num === "string" ? payload.current_wa_num : null,
        route_location:
          typeof payload.route_location === "string" ? payload.route_location : null,
        route_type:
          typeof payload.route_type === "string" ? payload.route_type : "ADDED",
        driver: null,
        helpers: [],
        trainees: [],
        extras: [],
      },
    };
  }

  if (!seat) return current;

  if (code.startsWith("ASSIGN_")) {
    if (!routeKey || !person || !current[routeKey]) return current;

    const next: Record<string, DispatchRoute> = {};

    for (const [key, route] of Object.entries(current)) {
      next[key] = removePersonFromRoute(route, person.roster_member_id);
    }

    const target = next[routeKey];
    if (!target) return current;

    if (seat === "driver") {
      if (target.driver) target.extras = [...target.extras, target.driver];
      target.driver = person;
    }

    if (seat === "helper") {
      target.helpers = [...target.helpers, person];
    }

    if (seat === "trainee") {
      target.trainees = [...target.trainees, person];
    }

    next[routeKey] = target;
    return next;
  }

  if (code.startsWith("UNASSIGN_")) {
    if (!routeKey || !current[routeKey]) return current;

    const target = current[routeKey];
    const nextRoute: DispatchRoute = { ...target };

    if (person) {
      const cleaned = removePersonFromRoute(nextRoute, person.roster_member_id);
      return { ...current, [routeKey]: cleaned };
    }

    if (seat === "driver") nextRoute.driver = null;
    if (seat === "helper") nextRoute.helpers = [];
    if (seat === "trainee") nextRoute.trainees = [];

    return { ...current, [routeKey]: nextRoute };
  }

  return current;
}

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
  const [error, setError] = useState<string | null>(null);
  const persistedCalloutKeys = useRef(new Set<string>());

  const serviceDate = todayIso();
  const dispatchLocked = dispatchDay?.status === "LOCKED";

  useEffect(() => {
    let active = true;

    async function loadDispatchInputs() {
      try {
        setLoading(true);
        setError(null);

        const [scheduleRes, routesRes, rosterRes, dispatchDayRes, eventTypesRes] = await Promise.all([
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
        ]);

        const [scheduleData, routesData, rosterData, dispatchDayData, eventTypesData] = await Promise.all([
          scheduleRes.json(),
          routesRes.json(),
          rosterRes.json(),
          dispatchDayRes.json(),
          eventTypesRes.json(),
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

        setScheduleRows((scheduleData?.rows ?? []) as GeneratedScheduleRow[]);
        setRoutes((routesData?.routes ?? []) as RouteRow[]);
        setRosterRows((rosterData?.roster ?? []) as DispatchRosterRow[]);
        setDispatchDay((dispatchDayData?.dispatch_day ?? null) as DispatchDayRow | null);
        setDispatchEvents((dispatchDayData?.events ?? []) as DispatchEventRow[]);
        setEventTypes((eventTypesData?.event_types ?? []) as DispatchEventTypeRow[]);
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

  const hydratedRoutes = useMemo(() => {
    const runFlag = runFlagForDate(serviceDate);
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

      const rawRouteName = row.route_name?.trim();
      if (!rawRouteName) continue;

      const key = cleanRouteKey(rawRouteName);

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
    let next: Record<string, DispatchRoute> = {};

    for (const route of hydratedRoutes) {
      next[route.route_key] = {
        ...route,
        helpers: [...route.helpers],
        trainees: [...route.trainees],
        extras: [...route.extras],
      };
    }

    const orderedEvents = [...dispatchEvents].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );

    const reversedEventIds = getReversedDispatchEventIds(orderedEvents);

    for (const event of orderedEvents) {
      if (reversedEventIds.has(event.id)) continue;
      if (event.event_code.startsWith("UNDO_")) continue;

      next = applyDispatchEvent(next, event);
    }

    setAssignments(next);
    setIntent(null);
  }, [hydratedRoutes, dispatchEvents]);

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

  const scheduledRosterIds = useMemo(() => {
    const ids = new Set<string>();

    for (const row of scheduleRows) {
      if (row.service_date !== serviceDate) continue;
      ids.add(row.roster_member_id);
    }

    return ids;
  }, [scheduleRows, serviceDate]);

  const allPeople = useMemo(() => {
    const byId = new Map<string, DispatchPerson>();

    for (const row of scheduleRows) {
      if (row.service_date !== serviceDate || !row.planned_on) continue;
      const person = personFromRow(row);
      byId.set(person.roster_member_id, person);
    }

    const reversedEventIds = getReversedDispatchEventIds(dispatchEvents);

    for (const event of dispatchEvents) {
      if (reversedEventIds.has(event.id)) continue;
      if (event.event_code.startsWith("UNDO_")) continue;
      if (event.event_code !== "ADD_DRIVER") continue;

      const person = dispatchPersonFromEvent(event);
      if (!person) continue;
      byId.set(person.roster_member_id, {
        ...person,
        source_kind: "DISPATCH_ADD_DRIVER",
      });
    }

    return Array.from(byId.values()).sort(personSort);
  }, [dispatchEvents, scheduleRows, serviceDate]);

  const callouts = useMemo(() => {
    const byId = new Map<string, DispatchPerson>();

    for (const row of scheduleRows) {
      if (row.service_date !== serviceDate) continue;
      if (row.override_type !== "CALL_OUT") continue;

      const person = personFromRow(row);
      byId.set(person.roster_member_id, person);
    }

    const reversedEventIds = getReversedDispatchEventIds(dispatchEvents);

    for (const event of dispatchEvents) {
      if (reversedEventIds.has(event.id)) continue;
      if (event.event_code.startsWith("UNDO_")) continue;
      if (event.event_code !== "CALL_OUT" && event.event_code !== "NO_SHOW") continue;

      const person = dispatchPersonFromEvent(event);
      if (!person) continue;

      byId.set(person.roster_member_id, {
        ...person,
        source_kind: "DISPATCH_EVENT",
        override_type: event.event_code,
      });
    }

    return Array.from(byId.values()).sort(personSort);
  }, [dispatchEvents, scheduleRows, serviceDate]);

  const calloutIds = useMemo(
    () => new Set(callouts.map((person) => person.roster_member_id)),
    [callouts]
  );

  const assignedIds = useMemo(() => {
    const ids = new Set<string>();

    const visibleRouteKeys = new Set(
      hydratedRoutes
        .filter((route) => route.route_key !== "UNASSIGNED")
        .map((route) => route.route_key)
    );

    for (const route of dispatchRoutes) {
      if (!visibleRouteKeys.has(route.route_key)) continue;

      if (route.driver) ids.add(route.driver.roster_member_id);
      for (const person of route.helpers) ids.add(person.roster_member_id);
      for (const person of route.trainees) ids.add(person.roster_member_id);
      for (const person of route.extras) ids.add(person.roster_member_id);
    }

    return ids;
  }, [dispatchRoutes, hydratedRoutes]);

  const workforce = useMemo(() => {
    const available = allPeople.filter(
      (person) =>
        !assignedIds.has(person.roster_member_id) &&
        !calloutIds.has(person.roster_member_id)
    );
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
  }, [allPeople, assignedIds, calloutIds]);

  const unscheduledDrivers = useMemo(() => {
    const scheduledOrAdded = new Set(allPeople.map((person) => person.roster_member_id));

    return rosterRows
      .filter((row) => !scheduledRosterIds.has(row.roster_member_id))
      .filter((row) => !scheduledOrAdded.has(row.roster_member_id))
      .filter((row) => {
        const status = (row.employment_status ?? "").toLowerCase();
        if (status && status !== "active") return false;

        const worker = `${row.worker_type ?? ""} ${row.full_name ?? ""}`.toLowerCase();
        return !worker.includes("helper") && !worker.includes("trainee");
      })
      .map((row) => ({
        roster_member_id: row.roster_member_id,
        full_name: row.full_name?.trim() || "Unnamed driver",
        worker_type: row.worker_type,
        source_kind: "ROSTER_UNSCHEDULED",
        override_type: null,
      }))
      .sort(personSort);
  }, [allPeople, rosterRows, scheduledRosterIds]);

  const availableRoutes = useMemo(() => {
    const assignedKeys = new Set(dispatchRoutes.map((route) => route.route_key));

    return routes
      .map((route) => {
        const key = cleanRouteKey(route.current_wa_num || route.route_name);

        return {
          route_key: key,
          route_name: route.route_name?.trim() || key,
          current_wa_num: route.current_wa_num,
          route_location: route.route_location,
          route_type: route.route_type,
          driver: null,
          helpers: [],
          trainees: [],
          extras: [],
        };
      })
      .filter((route) => !assignedKeys.has(route.route_key))
      .sort((a, b) =>
        routeLabel(a).localeCompare(routeLabel(b), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [dispatchRoutes, routes]);

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


  function openSeat(route: DispatchRoute, seat: Seat) {
    if (dispatchLocked) return;

    setIntent({
      route_key: route.route_key,
      route_label: routeLabel(route),
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
      route_label: route ? routeLabel(route) : routeKey,
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

    const scheduledOrAdded = new Set(allPeople.map((person) => person.roster_member_id));

    const candidates = rosterRows
      .filter((row) => !scheduledRosterIds.has(row.roster_member_id))
      .filter((row) => !scheduledOrAdded.has(row.roster_member_id))
      .filter((row) => {
        const status = (row.employment_status ?? "").toLowerCase();
        if (status && status !== "active") return false;

        const worker = `${row.worker_type ?? ""} ${row.full_name ?? ""}`.toLowerCase();
        return !worker.includes("helper") && !worker.includes("trainee");
      })
      .sort((a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );

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
          onUndoEvent={undoDispatchEvent}
          onLockDispatch={lockDispatch}
        />
        </section>
      </section>

      <DispatchEventOverlay
        open={eventOverlayOpen}
        saving={savingEvent}
        eventTypes={eventTypes}
        scheduledWorkforce={allPeople}
        unscheduledDrivers={unscheduledDrivers}
        availableRoutes={availableRoutes}
        onClose={() => setEventOverlayOpen(false)}
        onSubmit={addManualDispatchEvent}
      />
    </main>
  );
}
