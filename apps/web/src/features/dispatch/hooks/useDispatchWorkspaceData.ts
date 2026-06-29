import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { loadDispatchInputs } from "../lib/dispatchApi";
import { isoDateOffset } from "../lib/dispatchDates";
import type { RouteSortKey } from "../lib/dispatchSelectors";
import type { DswCurrentRow } from "../lib/dswDispatchSignals";
import type { DroPlanRow } from "../lib/droPlanSignals";
import type {
  DispatchDayRow,
  DispatchEventRow,
  DispatchEventTypeRow,
  DispatchRosterRow,
  GeneratedScheduleRow,
  RouteRow,
} from "../lib/dispatchSupport";

export type DispatchWorkspaceData = {
  dispatchDay: DispatchDayRow | null;
  dispatchEvents: DispatchEventRow[];
  droPlanRows: DroPlanRow[];
  droPlanSourceFrame: "AM" | "PM" | null;
  dswRows: DswCurrentRow[];
  error: string | null;
  eventTypes: DispatchEventTypeRow[];
  lastUpdatedAt: string | null;
  loading: boolean;
  refreshKey: number;
  refreshWorkspace: () => void;
  rosterRows: DispatchRosterRow[];
  routeSortKey: RouteSortKey;
  routes: RouteRow[];
  scheduleRows: GeneratedScheduleRow[];
  setDispatchDay: Dispatch<SetStateAction<DispatchDayRow | null>>;
  setDispatchEvents: Dispatch<SetStateAction<DispatchEventRow[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useDispatchWorkspaceData(
  slug: string,
  serviceDate: string
): DispatchWorkspaceData {
  const [scheduleRows, setScheduleRows] = useState<GeneratedScheduleRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [rosterRows, setRosterRows] = useState<DispatchRosterRow[]>([]);
  const [dispatchDay, setDispatchDay] = useState<DispatchDayRow | null>(null);
  const [dispatchEvents, setDispatchEvents] = useState<DispatchEventRow[]>([]);
  const [eventTypes, setEventTypes] = useState<DispatchEventTypeRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [droPlanRows, setDroPlanRows] = useState<DroPlanRow[]>([]);
  const [dswRows, setDswRows] = useState<DswCurrentRow[]>([]);
  const [droPlanSourceFrame, setDroPlanSourceFrame] =
    useState<"AM" | "PM" | null>(null);
  const [routeSortKey, setRouteSortKey] =
    useState<RouteSortKey>("route_name");

  useEffect(() => {
    let active = true;

    async function hydrateDispatchWorkspace() {
      try {
        setLoading(true);
        setError(null);

        const inputs = await loadDispatchInputs({
          slug,
          serviceDate,
          droPlanServiceDate: isoDateOffset(serviceDate, -1),
        });

        if (!active) return;

        if (!inputs.schedule.ok) {
          setError(inputs.schedule.data?.error ?? "Failed to load generated schedule.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!inputs.routes.ok) {
          setError(inputs.routes.data?.error ?? "Failed to load routes.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!inputs.roster.ok) {
          setError(inputs.roster.data?.error ?? "Failed to load roster.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!inputs.dispatchDay.ok) {
          setError(inputs.dispatchDay.data?.error ?? "Failed to load dispatch day.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        if (!inputs.eventTypes.ok) {
          setError(inputs.eventTypes.data?.error ?? "Failed to load dispatch event types.");
          setScheduleRows([]);
          setRoutes([]);
          setRosterRows([]);
          return;
        }

        const amDroRows = inputs.amDroPlan.ok ? inputs.amDroPlan.data?.rows ?? [] : [];
        const pmDroRows = inputs.pmDroPlan.ok ? inputs.pmDroPlan.data?.rows ?? [] : [];

        setDroPlanRows(amDroRows.length > 0 ? amDroRows : pmDroRows);
        setDswRows(inputs.dswCurrent.ok ? inputs.dswCurrent.data?.rows ?? [] : []);
        setDroPlanSourceFrame(
          amDroRows.length > 0
            ? "AM"
            : pmDroRows.length > 0
              ? "PM"
              : null
        );

        setRouteSortKey(
          inputs.operationsConfig.data?.config?.route_sort_key === "current_wa_num"
            ? "current_wa_num"
            : "route_name"
        );

        setScheduleRows((inputs.schedule.data?.rows ?? []) as GeneratedScheduleRow[]);
        setRoutes((inputs.routes.data?.routes ?? []) as RouteRow[]);
        setRosterRows((inputs.roster.data?.roster ?? []) as DispatchRosterRow[]);
        setDispatchDay((inputs.dispatchDay.data?.dispatch_day ?? null) as DispatchDayRow | null);
        setDispatchEvents((inputs.dispatchDay.data?.events ?? []) as DispatchEventRow[]);
        setEventTypes((inputs.eventTypes.data?.event_types ?? []) as DispatchEventTypeRow[]);
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

    if (slug) hydrateDispatchWorkspace();

    return () => {
      active = false;
    };
  }, [refreshKey, serviceDate, slug]);

  return {
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
    refreshWorkspace: () => setRefreshKey((current) => current + 1),
    rosterRows,
    routeSortKey,
    routes,
    scheduleRows,
    setDispatchDay,
    setDispatchEvents,
    setError,
  };
}
