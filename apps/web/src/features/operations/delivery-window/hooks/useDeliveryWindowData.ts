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
import { fetchServiceJsonOnce } from "../serviceDataClient";
import {
  buildHistoricalServiceRoutes,
  type HistoricalDswRoute,
  type HistoricalFccRoute,
  type HistoricalManifestRoute,
} from "../lib/historicalServiceRoutes";
import type { DroPlanRow } from "../lib/serviceRouteEvidence";

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

    if (event.event_code === "ASSIGN_DRIVER" && routeKey && !next[routeKey]) {
      next[routeKey] = {
        route_key: routeKey,
        route_name: event.route_label?.trim() || routeKey,
        current_wa_num: routeKey,
        route_location: null,
        route_type: "DISPATCH",
        driver: null,
        helpers: [],
        trainees: [],
        extras: [],
      };
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

export function useDeliveryWindowData(
  slug: string,
  serviceDate: string,
  liveServiceDate: string,
  refreshKey = 0
) {
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const historical = serviceDate !== liveServiceDate;
        const routesUrl = `/api/company/${slug}/routes`;
        const scheduleUrl = `/api/company/${slug}/schedule/generated?date=${serviceDate}`;
        const dispatchDayUrl = `/api/company/${slug}/dispatch/day?date=${serviceDate}`;
        const [
          routesRes,
          scheduleRes,
          dispatchDayRes,
          dswRes,
          droAmRes,
          droPmRes,
          fccRes,
          manifestRes,
        ] =
          await Promise.all([
            fetchServiceJsonOnce(routesUrl, refreshKey),
            fetchServiceJsonOnce(scheduleUrl, refreshKey),
            fetchServiceJsonOnce(dispatchDayUrl, refreshKey),
            fetchServiceJsonOnce(
              `/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`,
              refreshKey
            ),
            fetchServiceJsonOnce(
              `/api/company/${slug}/operations/reports/dro-plan?date=${serviceDate}&frame=AM`,
              refreshKey
            ),
            fetchServiceJsonOnce(
              `/api/company/${slug}/operations/reports/dro-plan?date=${serviceDate}&frame=PM`,
              refreshKey
            ),
            fetchServiceJsonOnce(
              `/api/company/${slug}/operations/reports/fcc-current?date=${serviceDate}`,
              refreshKey
            ),
            fetchServiceJsonOnce(
              `/api/company/${slug}/operations/route-health?serviceDate=${encodeURIComponent(serviceDate)}`,
              refreshKey
            ),
          ]);

        const routesData = routesRes.data;
        const scheduleData = scheduleRes.data;
        const dispatchDayData = dispatchDayRes.data;

        if (!active) return;

        if (!routesRes.ok && !historical) {
          setRoutes([]);
          setError(routesData?.error ?? "Failed to load routes.");
          return;
        }

        if (!scheduleRes.ok && !historical) {
          setRoutes([]);
          setError(scheduleData?.error ?? "Failed to load generated schedule.");
          return;
        }

        if (!dispatchDayRes.ok && !historical) {
          setRoutes([]);
          setError(dispatchDayData?.error ?? "Failed to load dispatch day.");
          return;
        }

        const configuredRoutes = (
          routesRes.ok ? routesData?.routes ?? [] : []
        ) as RouteRow[];
        const routeMap = new Map<string, DispatchRoute>();
        const routeAliases = new Map<string, string>();
        const runFlag = runFlagForDate(serviceDate);
        const baseRoutes = historical
          ? []
          : configuredRoutes.filter((route) => Boolean(route[runFlag as keyof RouteRow]));
        const selectedDay = buildHistoricalServiceRoutes({
          configuredRoutes,
          baseRoutes,
          dswRows: (dswRes.ok ? dswRes.data?.rows ?? [] : []) as HistoricalDswRoute[],
          droRows: [
            ...((droAmRes.ok ? droAmRes.data?.rows ?? [] : []) as DroPlanRow[]),
            ...((droPmRes.ok ? droPmRes.data?.rows ?? [] : []) as DroPlanRow[]),
          ],
          fccRows: (fccRes.ok ? fccRes.data?.rows ?? [] : []) as HistoricalFccRoute[],
          manifestRoutes: (manifestRes.ok
            ? manifestRes.data?.routes ?? []
            : []) as HistoricalManifestRoute[],
        });
        selectedDay.routes.forEach((route, key) => routeMap.set(key, route));
        selectedDay.aliases.forEach((key, alias) => routeAliases.set(alias, key));

        for (const row of (
          scheduleRes.ok ? scheduleData?.rows ?? [] : []
        ) as GeneratedScheduleRow[]) {
          if (row.service_date !== serviceDate || !row.planned_on) continue;

          const rawRouteName = row.route_name?.trim();
          if (!rawRouteName) continue;

          const normalizedRouteName = rawRouteName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          const key =
            routeAliases.get(normalizedRouteName) ?? cleanRouteKey(rawRouteName);
          let route = routeMap.get(key);
          if (!route) {
            const configured = configuredRoutes.find((candidate) =>
              [candidate.route_name, candidate.current_wa_num].some(
                (alias) =>
                  String(alias ?? "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "") === normalizedRouteName
              )
            );
            route = {
              route_key: key,
              route_name: configured?.route_name?.trim() || rawRouteName,
              current_wa_num: configured?.current_wa_num ?? null,
              route_location: configured?.route_location ?? null,
              route_type: configured?.route_type ?? "DISPATCH",
              driver: null,
              helpers: [],
              trainees: [],
              extras: [],
            };
            routeMap.set(key, route);
          }

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
          (dispatchDayRes.ok ? dispatchDayData?.events ?? [] : []) as DispatchEventRow[]
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
  }, [slug, serviceDate, liveServiceDate, refreshKey]);

  return { routes, loading, error };
}
