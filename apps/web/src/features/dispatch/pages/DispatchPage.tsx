"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  type AssignmentIntent,
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
  shell,
  todayIso,
  todayRunFlag,
} from "../lib/dispatchSupport";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serviceDate = todayIso();

  useEffect(() => {
    let active = true;

    async function loadDispatchInputs() {
      try {
        setLoading(true);
        setError(null);

        const [scheduleRes, routesRes] = await Promise.all([
          fetch(`/api/company/${slug}/schedule/generated`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/routes`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const [scheduleData, routesData] = await Promise.all([
          scheduleRes.json(),
          routesRes.json(),
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

        setScheduleRows((scheduleData?.rows ?? []) as GeneratedScheduleRow[]);
        setRoutes((routesData?.routes ?? []) as RouteRow[]);
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
  }, [slug]);

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

  function openSeat(route: DispatchRoute, seat: Seat) {
    setIntent({
      route_key: route.route_key,
      route_label: routeLabel(route),
      seat,
    });
  }

  function assignPerson(person: DispatchPerson) {
    if (!intent) return;

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

  return (
    <main style={shell}>
      <section
        style={{
          ...panel,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={eyebrow}>Dispatch Workspace</p>
          <h1
            style={{
              margin: "2px 0 0",
              maxWidth: "none",
              fontSize: 26,
              lineHeight: 1.1,
              letterSpacing: "-0.04em",
            }}
          >
            Today&apos;s Operation
          </h1>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          <span>Service Date: {serviceDate}</span>
          <span>·</span>
          <span>State: Hydrated Draft</span>
          <span>·</span>
          <span>Routes: {summary.total}</span>
          <span>·</span>
          <span>Covered: {summary.withDriver}</span>
          <span>·</span>
          <span style={{ color: summary.withoutDriver ? "#b54708" : "#166534" }}>
            Needs Driver: {summary.withoutDriver}
          </span>
        </div>
      </section>

      {error ? (
        <section style={{ ...panel, padding: 12 }}>
          <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr) 300px",
          gap: 10,
          alignItems: "start",
        }}
      >
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
        />
      </section>
    </main>
  );
}
