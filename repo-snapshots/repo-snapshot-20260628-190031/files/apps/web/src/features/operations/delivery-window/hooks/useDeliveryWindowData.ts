"use client";

import { useEffect, useState } from "react";
import {
  type DispatchEventRow,
  type DispatchRoute,
  type GeneratedScheduleRow,
  type RouteRow,
  cleanRouteKey,
  classifyPerson,
  getReversedDispatchEventIds,
  personFromRow,
  runFlagForDate,
} from "@/features/dispatch/lib/dispatchSupport";

function removeDriver(route: DispatchRoute, rosterMemberId: string): DispatchRoute {
  return {
    ...route,
    driver: route.driver?.roster_member_id === rosterMemberId ? null : route.driver,
    helpers: route.helpers.filter((person) => person.roster_member_id !== rosterMemberId),
    trainees: route.trainees.filter((person) => person.roster_member_id !== rosterMemberId),
    extras: route.extras.filter((person) => person.roster_member_id !== rosterMemberId),
  };
}

function driverFromEvent(event: DispatchEventRow) {
  if (!event.person_roster_member_id || !event.person_name) return null;

  return {
    roster_member_id: event.person_roster_member_id,
    full_name: event.person_name,
    worker_type: null,
    source_kind: "DISPATCH_EVENT",
    override_type: null,
  };
}

function applyDispatchDriverEvents(
  routes: Record<string, DispatchRoute>,
  events: DispatchEventRow[]
) {
  let next = { ...routes };
  const orderedEvents = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const reversedEventIds = getReversedDispatchEventIds(orderedEvents);

  for (const event of orderedEvents) {
    if (reversedEventIds.has(event.id)) continue;
    if (event.event_code.startsWith("UNDO_")) continue;

    const routeKey = event.route_key ?? event.to_route_key ?? null;
    const driver = driverFromEvent(event);

    if (event.event_code === "ADD_ROUTE" && routeKey && !next[routeKey]) {
      const payload = event.event_payload ?? {};
      next[routeKey] = {
        route_key: routeKey,
        route_name: typeof payload.route_name === "string" ? payload.route_name : event.route_label ?? routeKey,
        current_wa_num: typeof payload.current_wa_num === "string" ? payload.current_wa_num : null,
        route_location: typeof payload.route_location === "string" ? payload.route_location : null,
        route_type: typeof payload.route_type === "string" ? payload.route_type : "ADDED",
        driver: null,
        helpers: [],
        trainees: [],
        extras: [],
      };
    }

    if (event.event_code === "REMOVE_ROUTE" && routeKey && next[routeKey]) {
      delete next[routeKey];
    }

    if (event.event_code === "ASSIGN_DRIVER" && routeKey && driver && next[routeKey]) {
      const cleaned: Record<string, DispatchRoute> = {};
      for (const [key, route] of Object.entries(next)) {
        cleaned[key] = removeDriver(route, driver.roster_member_id);
      }

      cleaned[routeKey] = {
        ...cleaned[routeKey],
        driver,
      };

      next = cleaned;
    }

    if (event.event_code === "UNASSIGN_DRIVER" && routeKey && next[routeKey]) {
      next[routeKey] = {
        ...next[routeKey],
        driver: null,
      };
    }
  }

  return next;
}

export function useDeliveryWindowData(slug: string, serviceDate: string, refreshKey = 0) {
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [routesRes, scheduleRes, dispatchDayRes] = await Promise.all([
          fetch(`/api/company/${slug}/routes`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/schedule/generated?date=${serviceDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/dispatch/day?date=${serviceDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const [routesData, scheduleData, dispatchDayData] = await Promise.all([
          routesRes.json(),
          scheduleRes.json(),
          dispatchDayRes.json(),
        ]);

        if (!active) return;

        if (!routesRes.ok) {
          setRoutes([]);
          setError(routesData?.error ?? "Failed to load routes.");
          return;
        }

        if (!scheduleRes.ok) {
          setRoutes([]);
          setError(scheduleData?.error ?? "Failed to load generated schedule.");
          return;
        }

        if (!dispatchDayRes.ok) {
          setRoutes([]);
          setError(dispatchDayData?.error ?? "Failed to load dispatch day.");
          return;
        }

        const runFlag = runFlagForDate(serviceDate);
        const routeMap = new Map<string, DispatchRoute>();

        for (const route of (routesData?.routes ?? []) as RouteRow[]) {
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

        for (const row of (scheduleData?.rows ?? []) as GeneratedScheduleRow[]) {
          if (row.service_date !== serviceDate || !row.planned_on) continue;

          const rawRouteName = row.route_name?.trim();
          if (!rawRouteName) continue;

          const key = cleanRouteKey(rawRouteName);
          const route = routeMap.get(key);
          if (!route) continue;

          const person = personFromRow(row);
          const seat = classifyPerson(row);

          if (seat === "driver" && !route.driver) {
            route.driver = person;
          } else if (seat === "helper") {
            route.helpers.push(person);
          } else if (seat === "trainee") {
            route.trainees.push(person);
          } else {
            route.extras.push(person);
          }
        }

        const withDispatchEvents = applyDispatchDriverEvents(
          Object.fromEntries(routeMap.entries()),
          (dispatchDayData?.events ?? []) as DispatchEventRow[]
        );

        setRoutes(
          Object.values(withDispatchEvents).sort((a, b) =>
            (a.current_wa_num || a.route_name || a.route_key).localeCompare(
              b.current_wa_num || b.route_name || b.route_key,
              undefined,
              { numeric: true, sensitivity: "base" }
            )
          )
        );
      } catch (err) {
        if (!active) return;
        setRoutes([]);
        setError(err instanceof Error ? err.message : "Failed to load delivery window data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && serviceDate) load();

    return () => {
      active = false;
    };
  }, [slug, serviceDate, refreshKey]);

  return { routes, loading, error };
}
