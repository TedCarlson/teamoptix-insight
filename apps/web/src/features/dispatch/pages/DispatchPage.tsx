"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type AssignmentIntent,
  type DispatchDayRow,
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRoute,
  type Seat,
  cleanRouteKey,
  panel,
  personSort,
} from "../lib/dispatchSupport";
import { addDaysIso } from "../lib/dispatchDates";
import {
  recordDispatchEvent,
  reopenDispatchDay,
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
import ExpressReportOverlay from "@/features/operations/manifests/components/ExpressReportOverlay";
import ComplianceReportOverlay from "@/features/operations/components/ComplianceReportOverlay";
import { DispatchAttendanceOverlay } from "../components/DispatchAttendanceOverlay";
import { DispatchEventOverlay } from "../components/DispatchEventOverlay";
import { DispatchRightRail } from "../components/DispatchRightRail";
import { DispatchRouteQueue } from "../components/DispatchRouteQueue";
import { DispatchWorkforceRail } from "../components/DispatchWorkforceRail";
import type { ExpressDataHealth, ExpressProgress } from "@/features/operations/express/expressProgress";
import { useSupplementalCollectionAction } from "@/features/operations/workspace/useSupplementalCollectionAction";

type DispatchExpressHealth = {
  route_key: string;
  route_label: string | null;
  express: {
    package_count: number;
    complete_package_count: number;
    attempted_package_count: number;
    open_package_count: number;
    data_health: {
      tracking_identity_missing_count: number;
      stop_link_missing_count: number;
      stop_link_ambiguous_count: number;
      reference_match_available: boolean;
    };
  };
};

type DispatchExpressSignal = ExpressProgress & {
  dataHealth: Partial<ExpressDataHealth>;
};

export default function DispatchPage({
  slug,
  serviceDate,
}: {
  slug: string;
  serviceDate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [assignments, setAssignments] = useState<Record<string, DispatchRoute>>({});
  const [intent, setIntent] = useState<AssignmentIntent>(null);
  const [eventOverlayOpen, setEventOverlayOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [locking, setLocking] = useState(false);
  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [expressReportOpen, setExpressReportOpen] = useState(false);
  const [complianceReportOpen, setComplianceReportOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const persistedCalloutKeys = useRef(new Set<string>());
  const [expressHealthRows, setExpressHealthRows] = useState<DispatchExpressHealth[]>([]);
  const [expressHealthTotals, setExpressHealthTotals] = useState<DispatchExpressSignal>({
    total: 0,
    complete: 0,
    attempted: 0,
    open: 0,
    dataHealth: { referenceMatchAvailable: true },
  });

  const planningDate = addDaysIso(serviceDate, 1);
  const {
    dispatchDay,
    dispatchEvents,
    droPlanRows,
    droPlanSourceFrame,
    dswRows,
    error,
    eventTypes,
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
  const deliveryPhase = dispatchDay?.status === "LOCKED";
  const { action: supplementalCollectionAction } =
    useSupplementalCollectionAction({
      slug,
      serviceDate,
      enabled: true,
    });

  useEffect(() => {
    const requestedAction = searchParams.get("action");
    if (requestedAction !== "actions" && requestedAction !== "attendance") {
      return;
    }

    if (requestedAction === "attendance") {
      setAttendanceOpen(true);
    } else {
      setEventOverlayOpen(true);
    }
    router.replace(`/company/${slug}/operations/dispatch`, { scroll: false });
  }, [router, searchParams, slug]);

  useEffect(() => {
    let active = true;
    async function loadExpressHealth() {
      try {
        const response = await fetch(
          `/api/company/${slug}/operations/route-health?serviceDate=${serviceDate}`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = await response.json();
        if (!active) return;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Express evidence is unavailable.");
        }
        setExpressHealthRows(Array.isArray(payload.routes) ? payload.routes : []);
        setExpressHealthTotals({
          total: Number(payload.totals?.express_package_count ?? 0),
          complete: Number(payload.totals?.complete_express_package_count ?? 0),
          attempted: Number(payload.totals?.attempted_express_package_count ?? 0),
          open: Number(payload.totals?.open_express_package_count ?? 0),
          dataHealth: {
            trackingIdentityMissing: Number(payload.totals?.tracking_identity_missing_count ?? 0),
            stopLinkMissing: Number(payload.totals?.stop_link_missing_count ?? 0),
            stopLinkAmbiguous: Number(payload.totals?.stop_link_ambiguous_count ?? 0),
            referenceMatchAvailable: payload.totals?.reference_match_available !== false,
          },
        });
      } catch {
        if (active) {
          setExpressHealthRows([]);
          setExpressHealthTotals({
            total: 0,
            complete: 0,
            attempted: 0,
            open: 0,
            dataHealth: { referenceMatchAvailable: false },
          });
        }
      }
    }
    if (slug) void loadExpressHealth();
    return () => { active = false; };
  }, [refreshKey, serviceDate, slug]);

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

  const calloutPersonIds = useMemo(
    () => new Set(callouts.map((person) => person.roster_member_id)),
    [callouts]
  );
  const assignmentByPersonId = useMemo(() => {
    const assignmentMap = new Map<
      string,
      { routeLabel: string; seat: Seat }
    >();

    dispatchRoutes.forEach((route) => {
      if (route.route_key === "UNASSIGNED") return;
      const routeLabel = orderedRouteLabelForSort(route);
      if (route.driver) {
        assignmentMap.set(route.driver.roster_member_id, {
          routeLabel,
          seat: "driver",
        });
      }
      route.helpers.forEach((person) => {
        assignmentMap.set(person.roster_member_id, {
          routeLabel,
          seat: "helper",
        });
      });
      route.trainees.forEach((person) => {
        assignmentMap.set(person.roster_member_id, {
          routeLabel,
          seat: "trainee",
        });
      });
    });

    return assignmentMap;
  }, [dispatchRoutes, orderedRouteLabelForSort]);

  const rosterPeople = useMemo(() => {
    const peopleById = new Map<string, DispatchPerson>();
    [...workforce.available, ...callouts].forEach((person) => {
      if (
        !assignmentByPersonId.has(person.roster_member_id) &&
        !peopleById.has(person.roster_member_id)
      ) {
        peopleById.set(person.roster_member_id, person);
      }
    });
    return [...peopleById.values()].sort(personSort);
  }, [assignmentByPersonId, callouts, workforce.available]);

  const expressSignalsByRouteKey = useMemo(() => {
    const normalize = (value: string | null | undefined) =>
      String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const healthIndex = new Map<string, DispatchExpressHealth>();
    expressHealthRows.forEach((health) => {
      [health.route_key, health.route_label].forEach((key) => {
        const normalized = normalize(key);
        if (normalized) healthIndex.set(normalized, health);
      });
    });

    return dispatchRoutes.reduce<Record<string, DispatchExpressSignal>>(
      (signals, route) => {
        const candidates = [route.route_key, route.current_wa_num, route.route_name];
        let health: DispatchExpressHealth | undefined;
        for (const candidate of candidates) {
          const normalized = normalize(candidate);
          health = healthIndex.get(normalized);
          if (health) break;
        }
        if (health?.express.package_count) {
          signals[route.route_key] = {
            total: Number(health.express.package_count),
            complete: Number(health.express.complete_package_count),
            attempted: Number(health.express.attempted_package_count),
            open: Number(health.express.open_package_count),
            dataHealth: {
              trackingIdentityMissing: Number(health.express.data_health?.tracking_identity_missing_count ?? 0),
              stopLinkMissing: Number(health.express.data_health?.stop_link_missing_count ?? 0),
              stopLinkAmbiguous: Number(health.express.data_health?.stop_link_ambiguous_count ?? 0),
              referenceMatchAvailable: health.express.data_health?.reference_match_available !== false,
            },
          };
        }
        return signals;
      },
      {}
    );
  }, [dispatchRoutes, expressHealthRows]);


  function stagePerson(person: DispatchPerson) {
    setIntent((current) =>
      current?.person.roster_member_id === person.roster_member_id
        ? null
        : {
            person,
            route_key: null,
            route_label: null,
          }
    );
  }

  function selectAssignmentRoute(route: DispatchRoute) {
    setIntent((current) =>
      current
        ? {
            ...current,
            route_key: route.route_key,
            route_label: orderedRouteLabelForSort(route),
          }
        : null
    );
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

  function completeAssignment(seat: Seat) {
    if (!intent?.route_key || !intent.route_label) return;

    const person = intent.person;
    const routeKey = intent.route_key;
    const routeLabel = intent.route_label;

    setAssignments((current) => {
      const target = current[routeKey];
      if (!target) return current;

      const next: Record<string, DispatchRoute> = {};

      for (const [key, route] of Object.entries(current)) {
        next[key] = removePersonFromRoute(route, person.roster_member_id);
      }

      const updatedTarget = next[routeKey];

      if (seat === "driver") {
        if (updatedTarget.driver) {
          updatedTarget.extras = [...updatedTarget.extras, updatedTarget.driver];
        }
        updatedTarget.driver = person;
      }

      if (seat === "helper") {
        updatedTarget.helpers = [...updatedTarget.helpers, person];
      }

      if (seat === "trainee") {
        updatedTarget.trainees = [...updatedTarget.trainees, person];
      }

      next[routeKey] = updatedTarget;

      return next;
    });

    void recordAssignmentEvent({
      event_code:
        seat === "driver"
          ? "ASSIGN_DRIVER"
          : seat === "helper"
            ? "ASSIGN_HELPER"
            : "ASSIGN_TRAINEE",
      event_label:
        seat === "driver"
          ? "Driver assigned"
          : seat === "helper"
            ? "Helper assigned"
            : "Trainee assigned",
      route_key: routeKey,
      route_label: routeLabel,
      seat,
      person,
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
    action_phase?: "dispatch" | "delivery";
    event_code: string;
    event_label: string;
    event_category: string;
    note: string;
    person_roster_member_id: string | null;
    person_name: string | null;
    route_key?: string | null;
    route_label?: string | null;
    from_route_key?: string | null;
    from_route_label?: string | null;
    to_route_key?: string | null;
    to_route_label?: string | null;
    event_payload?: Record<string, unknown>;
    walk_on_full_name?: string | null;
    walk_on_record_mode?: "CANDIDATE" | "WALK_ON";
    walk_on_roster_member_id?: string | null;
    walk_on_dswid?: string | null;
    walk_on_workforce_unit_id?: string | null;
    walk_on_new_workforce_unit_name?: string | null;
    walk_on_service_date?: string | null;
  }) => {
    try {
      setSavingEvent(true);
      setError(null);

      let walkOnRosterId: string | null = null;
      const walkOnName = payload.walk_on_full_name?.trim();
      const walkOnRecordMode = payload.walk_on_record_mode ?? "WALK_ON";
      const eventServiceDate = payload.walk_on_service_date || serviceDate;

      if (walkOnName) {
        const walkOnRes = await fetch(`/api/company/${slug}/dispatch/walk-on`, {
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
        dispatchDate: eventServiceDate,
        payload: {
          ...payload,
          event_code: walkOnName ? "ADD_DRIVER" : payload.event_code,
          event_label: walkOnName
            ? walkOnRecordMode === "CANDIDATE"
              ? "Walk-on candidate added"
              : "Walk-on driver added"
            : payload.event_label,
          person_roster_member_id: walkOnRosterId || payload.person_roster_member_id,
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
        setDispatchEvents((current) => [...current, data.event as DispatchEventRow]);
      }

      if (data?.dispatch_day && eventServiceDate === serviceDate) {
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
    if (!slug || callouts.length === 0) return;

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
  }, [addManualDispatchEvent, callouts, dispatchEvents, serviceDate, slug]);


  async function undoDispatchEvent(event: DispatchEventRow) {
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


  async function returnToDispatch() {
    if (locking || dispatchDay?.status !== "LOCKED") return;

    try {
      setLocking(true);
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
          slug={slug}
          refreshing={loading}
          onRefresh={refreshWorkspace}
          onUpload={() => setUploadOverlayOpen(true)}
          onActions={() => setEventOverlayOpen(true)}
          onComplianceReport={() => setComplianceReportOpen(true)}
          onExpressReport={() => setExpressReportOpen(true)}
          onAttendance={() => setAttendanceOpen(true)}
          attendanceLabel={intent ? "Choose Route" : "Attendance"}
        />

        {error ? (
          <section style={{ ...panel, padding: 12, marginTop: 10 }}>
            <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
          </section>
        ) : null}

        <section className="dispatch-grid">
            <DispatchWorkforceRail
              people={rosterPeople}
              intent={intent}
              calloutPersonIds={calloutPersonIds}
              arrivedPersonIds={arrivedPersonIds}
              onToggleArrived={toggleArrived}
              onStagePerson={stagePerson}
            />

            <DispatchRouteQueue
              routeLabelForDisplay={orderedRouteLabelForSort}
              routes={dispatchRoutes}
              totalRoutes={summary.total}
              loading={loading}
              intent={intent}
              onSelectRoute={selectAssignmentRoute}
              onSelectSeat={completeAssignment}
              arrivedPersonIds={arrivedPersonIds}
              onToggleArrived={toggleArrived}
              planSignalsByRouteKey={planSignalsByRouteKey}
              dswSignalsByRouteKey={dswSignalsByRouteKey}
              planTotals={planTotals}
              dswTotals={dswTotals}
              expressSignalsByRouteKey={expressSignalsByRouteKey}
              expressTotals={expressHealthTotals}
              planSourceLabel={droPlanSourceFrame ? `${droPlanSourceFrame} DRO` : null}
            />

            <div className="dispatch-right-column" style={{ display: "grid", gap: 12 }}>
              <DispatchRightRail
                summary={summary}
                dispatchRoutes={dispatchRoutes}
                dispatchDay={dispatchDay}
                events={dispatchEvents}
                onUndoEvent={undoDispatchEvent}
              />
            </div>
          </section>
      </section>


      <ExpressReportOverlay
        open={expressReportOpen}
        slug={slug}
        serviceDate={serviceDate}
        surfaceLabel="Dispatch"
        onClose={() => setExpressReportOpen(false)}
      />
      <ComplianceReportOverlay open={complianceReportOpen} slug={slug} onClose={() => setComplianceReportOpen(false)} />

      <OperationsReportUploadOverlay
        open={uploadOverlayOpen}
        onClose={(shouldRefresh) => {
          setUploadOverlayOpen(false);
          if (shouldRefresh) refreshWorkspace();
        }}
      />

      <DispatchAttendanceOverlay
        open={attendanceOpen}
        intent={intent}
        people={rosterPeople}
        availablePeople={workforce.available}
        callouts={callouts}
        arrivedPersonIds={arrivedPersonIds}
        onClose={() => setAttendanceOpen(false)}
        onToggleArrived={toggleArrived}
        onSelectPerson={stagePerson}
      />

      <DispatchEventOverlay
        key={`${eventOverlayOpen ? "open" : "closed"}:${deliveryPhase ? "delivery" : "dispatch"}`}
        slug={slug}
        serviceDate={serviceDate}
        open={eventOverlayOpen}
        saving={savingEvent}
        eventTypes={eventTypes}
        scheduledWorkforce={allPeople}
        unscheduledDrivers={unscheduledDrivers}
        availableRoutes={availableRoutes}
        activeRoutes={dispatchRoutes}
        phase={deliveryPhase ? "delivery" : "dispatch"}
        handoffSaving={locking}
        onReturnToDispatch={deliveryPhase ? returnToDispatch : undefined}
        onPrepareCorrectiveAction={(actionPhase) => {
          window.location.href = `/company/${slug}/people/corrective-actions?source=${actionPhase}&incidentDate=${serviceDate}`;
        }}
        supplementalCollectionAction={supplementalCollectionAction}
        onClose={() => setEventOverlayOpen(false)}
        onSubmit={addManualDispatchEvent}
      />
    </main>
  );
}
