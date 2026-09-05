"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Route as RouteIcon,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  cleanRouteKey,
  type DispatchEventRow,
  type DispatchPerson,
  type DispatchRoute,
  type GeneratedScheduleRow,
  type RouteRow,
  personFromRow,
  personSort,
} from "@/features/dispatch/lib/dispatchSupport";
import {
  isDriverSeatWorker,
  resolveDailyScheduleCapacity,
  scheduleCapacitySignal,
} from "@/features/schedule/lib/scheduleCapacity";
import {
  OPERATIONS_WEEKDAYS,
  activeOperatingContextEvents,
  capacityRoutesFromLineup,
  dateLabel,
  isoDate,
  operatingContextForEvents,
  operationsMonthDays,
  projectHolidayWorkforce,
  resolveOperationsLineup,
  scheduledWorkforceCount,
  updateBlackoutSelection,
  type BlackoutSelectionMode,
  type OperatingContext,
} from "../lib/operationsCalendar";
import styles from "./operations-calendar.module.css";

type CalendarScheduleRow = GeneratedScheduleRow & {
  employment_status?: string | null;
};

type EventsByDate = Record<string, DispatchEventRow[]>;
type RouteSortKey = "route_name" | "current_wa_num";
type BlackoutRow = {
  blackout_date: string;
  event_id: string;
  message: string;
  created_at: string;
};

type Props = {
  slug: string;
  todayDate: string;
};

const DEFAULT_BLACKOUT_MESSAGE =
  "This date is part of a blackout period. If you have a persistent need for time off, please contact your leadership team directly.";

function contextLabel(context: OperatingContext) {
  if (context === "HOLIDAY") return "Holiday";
  if (context === "PEAK") return "Peak";
  return "BAU";
}

function routeLabel(route: DispatchRoute, sortKey: RouteSortKey) {
  const name = route.route_name?.trim();
  const workArea = route.current_wa_num?.trim();
  const pieces = sortKey === "current_wa_num"
    ? [workArea, name]
    : [name, workArea];
  return pieces.filter(Boolean).join(" · ") || route.route_key;
}

function baselineRouteToDispatch(route: RouteRow): DispatchRoute {
  const routeKey = cleanRouteKey(route.current_wa_num || route.route_name);
  return {
    route_key: routeKey,
    route_name: route.route_name?.trim() || routeKey,
    current_wa_num: route.current_wa_num,
    route_location: route.route_location,
    route_type: route.route_type,
    driver: null,
    helpers: [],
    trainees: [],
    extras: [],
  };
}

function signalTone(label: string) {
  if (label === "Target range") return "ready";
  if (label === "No operation") return "neutral";
  if (label === "No contingency" || label === "Labor high") return "watch";
  return "attention";
}

function activeHolidayEvent(events: DispatchEventRow[]) {
  return activeOperatingContextEvents(events).find(
    (event) => event.event_code === "OPERATIONS_CLOSED"
  ) ?? null;
}

export default function OperationsCalendarPage({ slug, todayDate }: Props) {
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = todayDate.split("-").map(Number);
    return new Date(year, monthNumber - 1, 1, 12);
  });
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [scheduleRows, setScheduleRows] = useState<CalendarScheduleRow[]>([]);
  const [eventsByDate, setEventsByDate] = useState<EventsByDate>({});
  const [blackouts, setBlackouts] = useState<BlackoutRow[]>([]);
  const [routeSortKey, setRouteSortKey] = useState<RouteSortKey>("route_name");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draftContext, setDraftContext] = useState<OperatingContext>("BAU");
  const [draftRoutes, setDraftRoutes] = useState<DispatchRoute[]>([]);
  const [inactiveRouteKeys, setInactiveRouteKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [assignmentNotice, setAssignmentNotice] = useState<string | null>(null);
  const [routeToAdd, setRouteToAdd] = useState("");
  const [blackoutMode, setBlackoutMode] = useState(false);
  const [blackoutSelectionMode, setBlackoutSelectionMode] =
    useState<BlackoutSelectionMode>("RANGE");
  const [selectedBlackoutDates, setSelectedBlackoutDates] = useState<string[]>([]);
  const [blackoutRangeAnchor, setBlackoutRangeAnchor] = useState<string | null>(null);
  const [blackoutReviewOpen, setBlackoutReviewOpen] = useState(false);
  const [blackoutGuidance, setBlackoutGuidance] = useState(
    DEFAULT_BLACKOUT_MESSAGE
  );
  const [blackoutSaving, setBlackoutSaving] = useState(false);
  const [blackoutStatus, setBlackoutStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDate, setLoadingDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarDays = useMemo(() => operationsMonthDays(month), [month]);
  const rangeStart = isoDate(calendarDays[0]);
  const rangeEnd = isoDate(calendarDays[calendarDays.length - 1]);

  const scheduleByDate = useMemo(() => {
    const byDate = new Map<string, CalendarScheduleRow[]>();
    for (const row of scheduleRows) {
      const current = byDate.get(row.service_date) ?? [];
      current.push(row);
      byDate.set(row.service_date, current);
    }
    return byDate;
  }, [scheduleRows]);

  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [routesResponse, scheduleResponse, configResponse, blackoutResponse] =
        await Promise.all([
          fetch(`/api/company/${slug}/routes`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(
            `/api/company/${slug}/schedule/generated?start_date=${rangeStart}&end_date=${rangeEnd}`,
            { credentials: "include", cache: "no-store" }
          ),
          fetch(`/api/company/${slug}/config/operations`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(
            `/api/company/${slug}/operations/calendar/blackouts?start_date=${rangeStart}&end_date=${rangeEnd}`,
            { credentials: "include", cache: "no-store" }
          ),
        ]);

      const [routesData, scheduleData, configData, blackoutData] =
        await Promise.all([
          routesResponse.json().catch(() => ({})),
          scheduleResponse.json().catch(() => ({})),
          configResponse.json().catch(() => ({})),
          blackoutResponse.json().catch(() => ({})),
        ]);

      if (!routesResponse.ok) {
        throw new Error(routesData?.error ?? "Unable to load route baselines.");
      }
      if (!scheduleResponse.ok) {
        throw new Error(scheduleData?.error ?? "Unable to load Workforce Calendar.");
      }
      setRoutes(Array.isArray(routesData?.routes) ? routesData.routes : []);
      setScheduleRows(
        Array.isArray(scheduleData?.rows) ? scheduleData.rows : []
      );
      setBlackouts(
        blackoutResponse.ok && Array.isArray(blackoutData?.rows)
          ? blackoutData.rows
          : []
      );
      setRouteSortKey(
        configResponse.ok &&
          configData?.config?.route_sort_key === "current_wa_num"
          ? "current_wa_num"
          : "route_name"
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the Operations Calendar."
      );
    } finally {
      setLoading(false);
    }
  }, [rangeEnd, rangeStart, slug]);

  const loadDateEvents = useCallback(async (date: string) => {
    const response = await fetch(
      `/api/company/${slug}/dispatch/day?date=${date}`,
      { credentials: "include", cache: "no-store" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error ?? "Unable to load the dated operation.");
    }
    const events = Array.isArray(data?.events)
      ? (data.events as DispatchEventRow[])
      : [];
    setEventsByDate((current) => ({ ...current, [date]: events }));
    return events;
  }, [slug]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const blackoutByDate = useMemo(
    () => new Map(blackouts.map((row) => [row.blackout_date, row])),
    [blackouts]
  );
  const selectedExistingBlackouts = useMemo(
    () =>
      selectedBlackoutDates.filter((date) => blackoutByDate.has(date)),
    [blackoutByDate, selectedBlackoutDates]
  );

  const selectedEvents = useMemo(
    () => (selectedDate ? eventsByDate[selectedDate] ?? [] : []),
    [eventsByDate, selectedDate]
  );
  const selectedScheduleRows = useMemo(
    () => (selectedDate ? scheduleByDate.get(selectedDate) ?? [] : []),
    [scheduleByDate, selectedDate]
  );
  const initialLineup = useMemo(
    () =>
      selectedDate
        ? resolveOperationsLineup({
            routes,
            scheduleRows: selectedScheduleRows,
            serviceDate: selectedDate,
            events: selectedEvents,
            routeSortKey,
            includeOperatingContext: false,
          })
        : [],
    [routeSortKey, routes, selectedDate, selectedEvents, selectedScheduleRows]
  );

  useEffect(() => {
    if (!selectedDate) return;
    setDraftContext(operatingContextForEvents(selectedEvents));
    setDraftRoutes(initialLineup);
    setInactiveRouteKeys(new Set());
    setAssignmentNotice(null);
    setRouteToAdd("");
  }, [initialLineup, selectedDate, selectedEvents]);

  const effectiveDraftRoutes = useMemo(
    () =>
      draftContext === "HOLIDAY"
        ? []
        : draftRoutes.filter(
            (route) => !inactiveRouteKeys.has(route.route_key)
          ),
    [draftContext, draftRoutes, inactiveRouteKeys]
  );
  const projectedScheduleRows = draftContext === "HOLIDAY"
    ? projectHolidayWorkforce(selectedScheduleRows)
    : selectedScheduleRows;
  const selectedWorkforce = scheduledWorkforceCount(projectedScheduleRows);
  const selectedCapacity = selectedDate
    ? resolveDailyScheduleCapacity({
        serviceDate: selectedDate,
        routes: capacityRoutesFromLineup(effectiveDraftRoutes),
        scheduleRows: projectedScheduleRows,
      })
    : null;
  const selectedSignal = selectedCapacity
    ? scheduleCapacitySignal(
        selectedCapacity.capacityDelta,
        selectedWorkforce,
        selectedCapacity.routeDemand
      ).label
    : null;

  const scheduledDrivers = useMemo(() => {
    const byId = new Map<string, DispatchPerson>();
    for (const row of selectedScheduleRows) {
      if (
        !row.planned_on ||
        !isDriverSeatWorker(row.worker_type, row.employment_status)
      ) continue;
      const person = personFromRow(row);
      byId.set(person.roster_member_id, person);
    }
    for (const route of draftRoutes) {
      if (route.driver) byId.set(route.driver.roster_member_id, route.driver);
    }
    return [...byId.values()].sort(personSort);
  }, [draftRoutes, selectedScheduleRows]);

  const driverAssignments = useMemo(() => {
    const byDriverId = new Map<
      string,
      { routeKey: string; routeLabel: string }
    >();
    for (const route of effectiveDraftRoutes) {
      if (!route.driver) continue;
      byDriverId.set(route.driver.roster_member_id, {
        routeKey: route.route_key,
        routeLabel: routeLabel(route, routeSortKey),
      });
    }
    return byDriverId;
  }, [effectiveDraftRoutes, routeSortKey]);

  const availableDrivers = useMemo(
    () =>
      scheduledDrivers.filter(
        (driver) => !driverAssignments.has(driver.roster_member_id)
      ),
    [driverAssignments, scheduledDrivers]
  );

  const assignedDrivers = useMemo(
    () =>
      scheduledDrivers.filter((driver) =>
        driverAssignments.has(driver.roster_member_id)
      ),
    [driverAssignments, scheduledDrivers]
  );

  const availableRoutes = useMemo(() => {
    const activeKeys = new Set(draftRoutes.map((route) => route.route_key));
    return routes
      .map(baselineRouteToDispatch)
      .filter((route) => !activeKeys.has(route.route_key))
      .sort((a, b) =>
        routeLabel(a, routeSortKey).localeCompare(
          routeLabel(b, routeSortKey),
          undefined,
          { numeric: true, sensitivity: "base" }
        )
      );
  }, [draftRoutes, routeSortKey, routes]);

  async function openDate(date: string) {
    setSelectedDate(date);
    try {
      setLoadingDate(true);
      setError(null);
      await loadDateEvents(date);
    } catch (dateError) {
      setError(
        dateError instanceof Error
          ? dateError.message
          : "Unable to load the dated operation."
      );
    } finally {
      setLoadingDate(false);
    }
  }

  function toggleBlackoutMode() {
    setBlackoutMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedBlackoutDates([]);
        setBlackoutRangeAnchor(null);
        setBlackoutReviewOpen(false);
      }
      setSelectedDate(null);
      setBlackoutStatus(null);
      return next;
    });
  }

  function selectBlackoutDate(date: string) {
    const next = updateBlackoutSelection({
      dates: selectedBlackoutDates,
      clickedDate: date,
      mode: blackoutSelectionMode,
      rangeAnchor: blackoutRangeAnchor,
    });
    setSelectedBlackoutDates(next.dates);
    setBlackoutRangeAnchor(next.rangeAnchor);
    setBlackoutStatus(null);
  }

  async function updateBlackouts(action: "SET" | "REMOVE") {
    const dates =
      action === "REMOVE"
        ? selectedExistingBlackouts
        : selectedBlackoutDates;
    if (!dates.length || blackoutSaving) return;

    try {
      setBlackoutSaving(true);
      setError(null);
      const response = await fetch(
        `/api/company/${slug}/operations/calendar/blackouts`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            dates,
            message: blackoutGuidance,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to update blackout dates.");
      }

      await loadCalendar();
      setBlackoutReviewOpen(false);
      setSelectedBlackoutDates([]);
      setBlackoutRangeAnchor(null);
      setBlackoutMode(false);
      setBlackoutStatus(
        action === "REMOVE"
          ? `${dates.length} blackout date${dates.length === 1 ? "" : "s"} removed.`
          : `${dates.length} blackout date${dates.length === 1 ? "" : "s"} saved.`
      );
    } catch (blackoutError) {
      setError(
        blackoutError instanceof Error
          ? blackoutError.message
          : "Unable to update blackout dates."
      );
    } finally {
      setBlackoutSaving(false);
    }
  }

  function closeDate() {
    if (saving) return;
    setSelectedDate(null);
  }

  function addRoute() {
    const route = availableRoutes.find((item) => item.route_key === routeToAdd);
    if (!route) return;
    setDraftRoutes((current) => [...current, route].sort((a, b) =>
      routeLabel(a, routeSortKey).localeCompare(
        routeLabel(b, routeSortKey),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
    ));
    setRouteToAdd("");
  }

  function toggleRoute(routeKey: string) {
    setInactiveRouteKeys((current) => {
      const next = new Set(current);
      if (next.has(routeKey)) next.delete(routeKey);
      else next.add(routeKey);
      return next;
    });
  }

  function assignDriver(routeKey: string, rosterMemberId: string) {
    const targetRoute = draftRoutes.find((route) => route.route_key === routeKey);
    if (!targetRoute) return;

    const driver = scheduledDrivers.find(
      (person) => person.roster_member_id === rosterMemberId
    ) ?? null;
    const priorAssignment = driver
      ? driverAssignments.get(driver.roster_member_id) ?? null
      : null;
    const targetLabel = routeLabel(targetRoute, routeSortKey);
    const displacedDriver =
      targetRoute.driver &&
      targetRoute.driver.roster_member_id !== driver?.roster_member_id
        ? targetRoute.driver
        : null;
    const displacementMessage = displacedDriver
      ? ` ${displacedDriver.full_name} returned to available.`
      : "";

    if (!driver) {
      setAssignmentNotice(
        targetRoute.driver
          ? `${targetRoute.driver.full_name} returned to available. ${targetLabel} now needs assignment.`
          : null
      );
    } else if (
      priorAssignment &&
      priorAssignment.routeKey !== routeKey
    ) {
      setAssignmentNotice(
        `${driver.full_name} moved from ${priorAssignment.routeLabel} to ${targetLabel}. ${priorAssignment.routeLabel} now needs assignment.${displacementMessage}`
      );
    } else {
      setAssignmentNotice(
        `${driver.full_name} assigned to ${targetLabel}.${displacementMessage}`
      );
    }

    setDraftRoutes((current) =>
      current.map((route) => {
        if (route.route_key === routeKey) return { ...route, driver };
        if (
          driver &&
          route.driver?.roster_member_id === driver.roster_member_id
        ) {
          return { ...route, driver: null };
        }
        return route;
      })
    );
  }

  async function postEvent(payload: Record<string, unknown>) {
    const response = await fetch(`/api/company/${slug}/dispatch/event`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispatch_date: selectedDate, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error ?? "Unable to save the dated operation.");
    }
  }

  async function postHolidayWorkflow(payload: Record<string, unknown>) {
    const response = await fetch(
      `/api/company/${slug}/operations/calendar/holiday`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispatch_date: selectedDate, ...payload }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error ?? "Unable to save the holiday workflow.");
    }
  }

  async function saveDate() {
    if (!selectedDate || saving) return;

    try {
      setSaving(true);
      setError(null);
      const currentContext = operatingContextForEvents(selectedEvents);
      const currentContextEvents = activeOperatingContextEvents(selectedEvents);

      if (currentContext !== draftContext) {
        const holidayEvent = activeHolidayEvent(selectedEvents);
        if (currentContext === "HOLIDAY" && holidayEvent) {
          await postHolidayWorkflow({
            action: "CLEAR",
            closure_event_id: holidayEvent.id,
          });
        }

        for (const contextEvent of currentContextEvents.filter(
          (event) => event.event_code !== "OPERATIONS_CLOSED"
        )) {
          await postEvent({
            event_code: `UNDO_${contextEvent.event_code}`,
            event_label: `Return ${dateLabel(selectedDate)} to its inherited plan`,
            event_category: "OPERATIONS",
            note: "Operating context changed from the Operations Calendar.",
            event_payload: {
              source: "operations_calendar",
              reverses_event_id: contextEvent.id,
              reverses_event_code: contextEvent.event_code,
            },
          });
        }

        if (draftContext === "HOLIDAY") {
          await postHolidayWorkflow({
            action: "SET",
            roster_member_ids: Array.from(
              new Set(
                selectedScheduleRows
                  .filter((row) => row.planned_on)
                  .map((row) => row.roster_member_id)
              )
            ),
          });
        } else if (draftContext === "PEAK") {
          await postEvent({
            event_code: "OPERATIONS_PEAK",
            event_label: "Peak",
            event_category: "OPERATIONS",
            note: `${contextLabel(draftContext)} set from the Operations Calendar.`,
            event_payload: {
              source: "operations_calendar",
              operating_context: draftContext,
            },
          });
        }
      }

      const routePlan = draftContext === "HOLIDAY" ? initialLineup : effectiveDraftRoutes;
      const initialKeys = new Set(initialLineup.map((route) => route.route_key));
      const draftKeys = new Set(routePlan.map((route) => route.route_key));
      const addedRoutes = routePlan.filter(
        (route) => !initialKeys.has(route.route_key)
      );
      const removedRoutes = initialLineup.filter(
        (route) => !draftKeys.has(route.route_key)
      );

      for (const route of addedRoutes) {
        await postEvent({
          event_code: "ADD_ROUTE",
          event_label: "Route added",
          event_category: "OPERATIONS",
          route_key: route.route_key,
          route_label: routeLabel(route, routeSortKey),
          note: "Route added from the Operations Calendar.",
          event_payload: {
            route_name: route.route_name,
            current_wa_num: route.current_wa_num,
            route_location: route.route_location,
            route_type: route.route_type ?? "ADDED",
            source: "operations_calendar",
          },
        });
      }

      for (const route of removedRoutes) {
        await postEvent({
          event_code: "REMOVE_ROUTE",
          event_label: "Route removed",
          event_category: "OPERATIONS",
          route_key: route.route_key,
          route_label: routeLabel(route, routeSortKey),
          note: "Route removed from the Operations Calendar.",
          event_payload: {
            route_name: route.route_name,
            current_wa_num: route.current_wa_num,
            route_location: route.route_location,
            route_type: route.route_type,
            removed_driver_name: route.driver?.full_name ?? null,
            source: "operations_calendar",
          },
        });
      }

      if (draftContext !== "HOLIDAY") {
        const initialByKey = new Map(
          initialLineup.map((route) => [route.route_key, route])
        );
        for (const route of routePlan) {
          const initialDriver = initialByKey.get(route.route_key)?.driver ?? null;
          if (
            initialDriver?.roster_member_id === route.driver?.roster_member_id
          ) continue;

          await postEvent({
            event_code: route.driver ? "ASSIGN_DRIVER" : "UNASSIGN_DRIVER",
            event_label: route.driver ? "Driver assigned" : "Driver unassigned",
            event_category: "ASSIGNMENT",
            route_key: route.route_key,
            route_label: routeLabel(route, routeSortKey),
            to_route_key: route.route_key,
            to_route_label: routeLabel(route, routeSortKey),
            seat: "driver",
            person_roster_member_id: route.driver?.roster_member_id ?? null,
            person_name: route.driver?.full_name ?? null,
            event_payload: {
              source: "operations_calendar",
            },
          });
        }
      }

      await Promise.all([loadDateEvents(selectedDate), loadCalendar()]);
      setSelectedDate(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the dated operation."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Operations planning</span>
          <h1>Operations Calendar</h1>
          <p>
            Route baselines become a dated operating plan, with Workforce
            readiness alongside it.
          </p>
        </div>
        <div className={styles.headerSummary}>
          <CalendarDays size={18} aria-hidden="true" />
          <span>Operational weeks run Saturday–Friday</span>
        </div>
      </header>

      <section className={styles.calendarCard} aria-busy={loading}>
        <div className={styles.calendarToolbar}>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Previous month"
            onClick={() => {
              setSelectedDate(null);
              setMonth(
                new Date(month.getFullYear(), month.getMonth() - 1, 1, 12)
              );
            }}
          >
            <ChevronLeft size={19} />
          </button>
          <div>
            <span>Operating plan</span>
            <strong>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </strong>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Next month"
            onClick={() => {
              setSelectedDate(null);
              setMonth(
                new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)
              );
            }}
          >
            <ChevronRight size={19} />
          </button>
        </div>

        <div className={styles.blackoutModeBar} data-active={blackoutMode}>
          <div className={styles.blackoutModeLabel}>
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>Blackout date selection</strong>
              <span>
                {blackoutMode
                  ? blackoutRangeAnchor
                    ? "Choose the last date in the range"
                    : "Select dates without changing routes or readiness"
                  : "Add a driver time-off restriction over the operating plan"}
              </span>
            </div>
          </div>
          {blackoutMode ? (
            <div className={styles.blackoutModeChoices} aria-label="Blackout selection method">
              {(["INDIVIDUAL", "RANGE"] as BlackoutSelectionMode[]).map(
                (mode) => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={blackoutSelectionMode === mode}
                    onClick={() => {
                      setBlackoutSelectionMode(mode);
                      setBlackoutRangeAnchor(null);
                    }}
                  >
                    {mode === "INDIVIDUAL" ? "Individual days" : "Date range"}
                  </button>
                )
              )}
            </div>
          ) : null}
          <button
            className={styles.blackoutSwitch}
            type="button"
            role="switch"
            aria-checked={blackoutMode}
            onClick={toggleBlackoutMode}
          >
            <span aria-hidden="true" />
            {blackoutMode ? "On" : "Off"}
          </button>
        </div>

        {blackoutStatus ? (
          <div className={styles.success} role="status">{blackoutStatus}</div>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.weekdayRow}>
          {OPERATIONS_WEEKDAYS.map((day) => (
            <div key={day}>{day.slice(0, 3)}</div>
          ))}
        </div>

        <div className={styles.calendarGrid}>
          {calendarDays.map((day) => {
            const date = isoDate(day);
            const dayEvents = eventsByDate[date] ?? [];
            const context = operatingContextForEvents(dayEvents);
            const daySchedule = scheduleByDate.get(date) ?? [];
            const resolvedDaySchedule = context === "HOLIDAY"
              ? projectHolidayWorkforce(daySchedule)
              : daySchedule;
            const lineup = resolveOperationsLineup({
              routes,
              scheduleRows: daySchedule,
              serviceDate: date,
              events: dayEvents,
              routeSortKey,
            });
            const capacity = resolveDailyScheduleCapacity({
              serviceDate: date,
              routes: capacityRoutesFromLineup(lineup),
              scheduleRows: resolvedDaySchedule,
            });
            const workforce = scheduledWorkforceCount(resolvedDaySchedule);
            const readiness = scheduleCapacitySignal(
              capacity.capacityDelta,
              workforce,
              capacity.routeDemand
            ).label;
            const outsideMonth = day.getMonth() !== month.getMonth();
            const isToday = date === todayDate;
            const blackout = blackoutByDate.get(date);
            const blackoutSelected = selectedBlackoutDates.includes(date);

            return (
              <button
                type="button"
                key={date}
                className={styles.day}
                data-outside={outsideMonth}
                data-today={isToday}
                data-context={context.toLowerCase()}
                data-blackout={Boolean(blackout)}
                data-blackout-selected={blackoutSelected}
                data-range-anchor={blackoutRangeAnchor === date}
                aria-pressed={blackoutMode ? blackoutSelected : undefined}
                onClick={() =>
                  blackoutMode ? selectBlackoutDate(date) : void openDate(date)
                }
                aria-label={`${dateLabel(date)}. ${contextLabel(context)}. ${lineup.length} routes.${blackout ? ` Blackout date. ${blackout.message}` : ""}`}
              >
                <span className={styles.dayTopline}>
                  <span className={styles.dayNumber}>{day.getDate()}</span>
                  <span className={styles.dayBadges}>
                    {blackout ? (
                      <span className={styles.blackoutPill}>Blackout</span>
                    ) : null}
                    {context !== "BAU" ? (
                      <span className={styles.contextPill}>
                        {contextLabel(context)}
                      </span>
                    ) : isToday ? (
                      <span className={styles.todayPill}>Today</span>
                    ) : null}
                  </span>
                </span>
                <span className={styles.dayMetric}>
                  <RouteIcon size={14} aria-hidden="true" />
                  <strong>{lineup.length}</strong> routes
                </span>
                <span className={styles.dayMetric}>
                  <Users size={14} aria-hidden="true" />
                  <strong>{workforce}</strong> workforce
                </span>
                <span
                  className={styles.readiness}
                  data-tone={signalTone(readiness)}
                >
                  {readiness}
                </span>
              </button>
            );
          })}
        </div>

        {blackoutMode ? (
          <div className={styles.blackoutSelectionBar} role="status">
            <div>
              <strong>
                {selectedBlackoutDates.length} date
                {selectedBlackoutDates.length === 1 ? "" : "s"} selected
              </strong>
              <span>
                {blackoutRangeAnchor
                  ? `Range starts ${dateLabel(blackoutRangeAnchor)} · choose the last date`
                  : selectedExistingBlackouts.length
                    ? `${selectedExistingBlackouts.length} already marked blackout`
                    : "Ready to review"}
              </span>
            </div>
            <button
              type="button"
              className={styles.clearButton}
              disabled={!selectedBlackoutDates.length}
              onClick={() => {
                setSelectedBlackoutDates([]);
                setBlackoutRangeAnchor(null);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className={styles.reviewButton}
              disabled={!selectedBlackoutDates.length || Boolean(blackoutRangeAnchor)}
              onClick={() => setBlackoutReviewOpen(true)}
            >
              Review blackout
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loading}>Resolving operating plan…</div>
        ) : null}
      </section>

      {blackoutReviewOpen ? (
        <div
          className={styles.backdrop}
          onMouseDown={() => {
            if (!blackoutSaving) setBlackoutReviewOpen(false);
          }}
        >
          <aside
            className={`${styles.drawer} ${styles.blackoutDrawer}`}
            role="dialog"
            aria-modal="true"
            aria-label="Review blackout dates"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.drawerHeader}>
              <div>
                <span className={styles.eyebrow}>Blackout date review</span>
                <h2>
                  {selectedBlackoutDates.length} date
                  {selectedBlackoutDates.length === 1 ? "" : "s"}
                </h2>
                <p>
                  This restriction is visible wherever drivers request time off.
                </p>
              </div>
              <button
                className={styles.closeButton}
                type="button"
                disabled={blackoutSaving}
                onClick={() => setBlackoutReviewOpen(false)}
                aria-label="Close blackout review"
              >
                <X size={20} />
              </button>
            </header>

            <div className={styles.blackoutDrawerBody}>
              <section className={styles.blackoutReviewSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>Selected dates</span>
                    <strong>
                      {dateLabel(selectedBlackoutDates[0], true)}
                      {selectedBlackoutDates.length > 1
                        ? ` → ${dateLabel(
                            selectedBlackoutDates[
                              selectedBlackoutDates.length - 1
                            ],
                            true
                          )}`
                        : ""}
                    </strong>
                  </div>
                  {selectedExistingBlackouts.length ? (
                    <span className={styles.scopePill}>
                      {selectedExistingBlackouts.length} existing
                    </span>
                  ) : null}
                </div>
                <div className={styles.blackoutDateChips}>
                  {selectedBlackoutDates.slice(0, 14).map((date) => (
                    <span key={date} data-existing={blackoutByDate.has(date)}>
                      {date}
                    </span>
                  ))}
                  {selectedBlackoutDates.length > 14 ? (
                    <span>+{selectedBlackoutDates.length - 14} more</span>
                  ) : null}
                </div>
              </section>

              <section className={styles.blackoutReviewSection}>
                <label className={styles.blackoutGuidanceLabel}>
                  <span>Driver guidance</span>
                  <textarea
                    value={blackoutGuidance}
                    maxLength={300}
                    onChange={(event) => setBlackoutGuidance(event.target.value)}
                  />
                  <small>{blackoutGuidance.length}/300</small>
                </label>
                <p className={styles.blackoutContractNote}>
                  Drivers cannot submit a time-off request containing these dates.
                  Routes, workforce expectations, and readiness are not changed.
                </p>
              </section>
            </div>

            <footer className={styles.blackoutDrawerFooter}>
              {selectedExistingBlackouts.length ? (
                <button
                  type="button"
                  className={styles.removeBlackoutButton}
                  disabled={blackoutSaving}
                  onClick={() => void updateBlackouts("REMOVE")}
                >
                  <Trash2 size={16} /> Remove selected blackouts
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className={styles.clearButton}
                disabled={blackoutSaving}
                onClick={() => setBlackoutReviewOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.reviewButton}
                disabled={blackoutSaving || !blackoutGuidance.trim()}
                onClick={() => void updateBlackouts("SET")}
              >
                {blackoutSaving ? "Saving…" : "Save & close"}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {selectedDate && selectedCapacity ? (
        <div className={styles.backdrop} onMouseDown={closeDate}>
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={`Operating plan for ${dateLabel(selectedDate)}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.drawerHeader}>
              <div>
                <span className={styles.eyebrow}>Dated operating plan</span>
                <h2>{dateLabel(selectedDate, true)}</h2>
                <p>This date · inherits from the route baseline</p>
              </div>
              <button
                className={styles.closeButton}
                type="button"
                onClick={closeDate}
                aria-label="Close date workbench"
              >
                <X size={20} />
              </button>
            </header>

            <div className={styles.drawerBody} aria-busy={loadingDate}>
              <section className={styles.contextSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>Operating context</span>
                    <strong>What kind of day is this?</strong>
                  </div>
                  <span className={styles.scopePill}>This date</span>
                </div>
                <div className={styles.contextControl}>
                  {(["BAU", "PEAK", "HOLIDAY"] as OperatingContext[]).map(
                    (context) => (
                      <button
                        type="button"
                        key={context}
                        disabled={loadingDate}
                        aria-pressed={draftContext === context}
                        data-context={context.toLowerCase()}
                        onClick={() => setDraftContext(context)}
                      >
                        {contextLabel(context)}
                      </button>
                    )
                  )}
                </div>
              </section>

              <section className={styles.readinessBand}>
                <div>
                  <span>Workforce Calendar</span>
                  <strong data-tone={signalTone(selectedSignal ?? "")}> 
                    {selectedSignal}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Routes</dt>
                    <dd>{effectiveDraftRoutes.length}</dd>
                  </div>
                  <div>
                    <dt>Workforce</dt>
                    <dd>{selectedWorkforce}</dd>
                  </div>
                  <div>
                    <dt>Covered</dt>
                    <dd>
                      {selectedCapacity.assignedRoutes}/{selectedCapacity.routeDemand}
                    </dd>
                  </div>
                  <div>
                    <dt>Delta</dt>
                    <dd>
                      {selectedCapacity.capacityDelta >= 0 ? "+" : ""}
                      {selectedCapacity.capacityDelta}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className={styles.lineupSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>Route lineup</span>
                    <strong>
                      {draftContext === "HOLIDAY"
                        ? "No routes expected"
                        : `${effectiveDraftRoutes.length} routes expected`}
                    </strong>
                  </div>
                </div>

                {draftContext === "HOLIDAY" ? (
                  <div className={styles.holidayMessage}>
                    <CalendarDays size={22} />
                    <div>
                      <strong>Holiday / non-operating</strong>
                      <p>
                        {scheduledWorkforceCount(selectedScheduleRows)} workforce
                        {scheduledWorkforceCount(selectedScheduleRows) === 1 ? " override is" : " overrides are"}
                        {" "}prepared. The normal lineup remains in Routes and
                        returns automatically on the next operating date.
                      </p>
                    </div>
                  </div>
                ) : null}

                {draftContext !== "HOLIDAY" ? (
                  <div className={styles.addRoute}>
                    <select
                      value={routeToAdd}
                      onChange={(event) => setRouteToAdd(event.target.value)}
                      aria-label="Route to add"
                    >
                      <option value="">Add a route from the baseline…</option>
                      {availableRoutes.map((route) => (
                        <option key={route.route_key} value={route.route_key}>
                          {routeLabel(route, routeSortKey)}
                        </option>
                      ))}
                    </select>
                    <button
                      className={styles.addButton}
                      type="button"
                      disabled={!routeToAdd || loadingDate}
                      onClick={addRoute}
                    >
                      <CirclePlus size={17} /> Add route
                    </button>
                  </div>
                ) : null}

                {assignmentNotice ? (
                  <div className={styles.assignmentNotice} role="status">
                    {assignmentNotice}
                  </div>
                ) : null}

                <div className={styles.routeList}>
                  <div className={styles.routeGridHeader} aria-hidden="true">
                    <span>Route</span>
                    <span>Operation</span>
                    <span>Driver assignment</span>
                  </div>
                  {draftRoutes.map((route) => {
                    const routeOn =
                      draftContext !== "HOLIDAY" &&
                      !inactiveRouteKeys.has(route.route_key);
                    return (
                      <article
                        key={route.route_key}
                        className={styles.routeRow}
                        data-active={routeOn}
                      >
                        <div className={styles.routeIdentity}>
                          <span>{route.current_wa_num || "Route"}</span>
                          <strong>{route.route_name || route.route_key}</strong>
                          <small>
                            {[route.route_location, route.route_type]
                              .filter(Boolean)
                              .join(" · ") || "Route baseline"}
                          </small>
                        </div>
                        <button
                          className={styles.routeToggle}
                          type="button"
                          disabled={loadingDate || draftContext === "HOLIDAY"}
                          aria-pressed={routeOn}
                          onClick={() => toggleRoute(route.route_key)}
                          title={
                            routeOn && route.driver
                              ? `${route.driver.full_name} will return to available when this route is off`
                              : undefined
                          }
                        >
                          <span aria-hidden="true" />
                          {routeOn ? "On" : "Off"}
                        </button>
                        <div className={styles.assignment}>
                          <select
                            value={routeOn ? route.driver?.roster_member_id ?? "" : ""}
                            disabled={!routeOn || loadingDate}
                            aria-label={`Driver assignment for ${routeLabel(route, routeSortKey)}`}
                            onChange={(event) =>
                              assignDriver(route.route_key, event.target.value)
                            }
                          >
                            <option value="">
                              {routeOn ? "Needs assignment" : "No assignment"}
                            </option>
                            {availableDrivers.length ? (
                              <optgroup label="Available">
                                {availableDrivers.map((driver) => (
                                  <option
                                    key={driver.roster_member_id}
                                    value={driver.roster_member_id}
                                  >
                                    {driver.full_name}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {assignedDrivers.length ? (
                              <optgroup label="Assigned — selecting will move">
                                {assignedDrivers.map((driver) => {
                                  const assignment = driverAssignments.get(
                                    driver.roster_member_id
                                  );
                                  return (
                                    <option
                                      key={driver.roster_member_id}
                                      value={driver.roster_member_id}
                                    >
                                      {driver.full_name} — {assignment?.routeLabel}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            ) : null}
                          </select>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            <footer className={styles.drawerFooter}>
              <div>
                <span>Resolved expectation</span>
                <strong>
                  {contextLabel(draftContext)} · {effectiveDraftRoutes.length} routes
                  {" · "}{selectedWorkforce} workforce
                </strong>
              </div>
              <button
                className="button"
                type="button"
                disabled={saving || loadingDate}
                onClick={closeDate}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={saving || loadingDate}
                onClick={() => void saveDate()}
              >
                {saving ? "Saving…" : loadingDate ? "Loading…" : "Save & Close"}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
