import {
  buildAllPeople,
  buildAssignedIds,
  buildAvailableRoutes,
  buildCallouts,
  buildDispatchSummary,
  buildPlanningRoutes,
  buildScheduledRosterIds,
  buildUnscheduledDrivers,
  buildWorkforce,
  orderedRouteLabel,
  type RouteSortKey,
} from "./dispatchSelectors";
import type { DswCurrentRow } from "./dswDispatchSignals";
import { buildDswDispatchSignals } from "./dswDispatchSignals";
import type { DroPlanRow } from "./droPlanSignals";
import { buildDroPlanSignals } from "./droPlanSignals";
import type {
  DispatchEventRow,
  DispatchRosterRow,
  DispatchRoute,
  GeneratedScheduleRow,
  RouteRow,
} from "./dispatchSupport";

type DispatchWorkspaceModelParams = {
  assignments: Record<string, DispatchRoute>;
  dispatchEvents: DispatchEventRow[];
  droPlanRows: DroPlanRow[];
  dswRows: DswCurrentRow[];
  hydratedRoutes: DispatchRoute[];
  planningDate: string;
  rosterRows: DispatchRosterRow[];
  routeSort: (a: DispatchRoute, b: DispatchRoute) => number;
  routeSortKey: RouteSortKey;
  routes: RouteRow[];
  scheduleRows: GeneratedScheduleRow[];
  serviceDate: string;
};

export function buildDispatchWorkspaceModel(params: DispatchWorkspaceModelParams) {
  const {
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
  } = params;

  const dispatchRoutes = Object.values(assignments).sort(routeSort);
  const { planSignalsByRouteKey, planTotals } = buildDroPlanSignals(
    dispatchRoutes,
    droPlanRows
  );
  const { dswSignalsByRouteKey, dswTotals } = buildDswDispatchSignals(
    dispatchRoutes,
    dswRows
  );
  const scheduledRosterIds = buildScheduledRosterIds(scheduleRows, serviceDate);
  const allPeople = buildAllPeople({
    scheduleRows,
    dispatchEvents,
    serviceDate,
  });
  const callouts = buildCallouts({
    scheduleRows,
    dispatchEvents,
    serviceDate,
  });
  const calloutIds = new Set(callouts.map((person) => person.roster_member_id));
  const assignedIds = buildAssignedIds(dispatchRoutes);
  const workforce = buildWorkforce({
    allPeople,
    assignedIds,
    calloutIds,
  });
  const unscheduledDrivers = buildUnscheduledDrivers({
    allPeople,
    rosterRows,
    scheduledRosterIds,
  });
  const availableRoutes = buildAvailableRoutes({
    dispatchRoutes,
    routes,
    routeSort,
  });
  const planningRoutes = buildPlanningRoutes({
    droPlanRows,
    planningDate,
    routeSort,
    routes,
  });
  const summary = buildDispatchSummary(
    dispatchRoutes,
    workforce.available.length
  );
  const orderedRouteLabelForSort = (route: DispatchRoute) =>
    orderedRouteLabel(route, routeSortKey);

  return {
    allPeople,
    assignedIds,
    availableRoutes,
    callouts,
    dispatchRoutes,
    dswSignalsByRouteKey,
    dswTotals,
    hydratedRoutes,
    orderedRouteLabelForSort,
    planSignalsByRouteKey,
    planTotals,
    planningRoutes,
    routeSort,
    scheduledRosterIds,
    summary,
    unscheduledDrivers,
    workforce,
  };
}
