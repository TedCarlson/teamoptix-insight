import type {
  DispatchPlanSignal,
  DroPlanRow,
  DroPlanTotals,
} from "./droPlanSignals";
import { buildDroPlanSignals } from "./droPlanSignals";
import type { DispatchRoute } from "./dispatchSupport";

export type DispatchDroSnapshot = {
  am: DroPlanRow[];
  pm: DroPlanRow[];
};

export type DispatchDroPlanByRoute = {
  am?: DispatchPlanSignal;
  pm?: DispatchPlanSignal;
};

export type DispatchDroSnapshotSignals = {
  planSignalsByRouteKey: Record<string, DispatchDroPlanByRoute>;
  amTotals: DroPlanTotals;
  pmTotals: DroPlanTotals;
};

export const emptyDroPlanSnapshot: DispatchDroSnapshot = {
  am: [],
  pm: [],
};

export function buildDispatchDroSignals(
  routes: DispatchRoute[],
  snapshot: DispatchDroSnapshot
): DispatchDroSnapshotSignals {
  const am = buildDroPlanSignals(routes, snapshot.am);
  const pm = buildDroPlanSignals(routes, snapshot.pm);

  const routeKeys = new Set([
    ...Object.keys(am.planSignalsByRouteKey),
    ...Object.keys(pm.planSignalsByRouteKey),
  ]);

  const planSignalsByRouteKey: Record<string, DispatchDroPlanByRoute> = {};

  for (const routeKey of routeKeys) {
    planSignalsByRouteKey[routeKey] = {
      am: am.planSignalsByRouteKey[routeKey],
      pm: pm.planSignalsByRouteKey[routeKey],
    };
  }

  return {
    planSignalsByRouteKey,
    amTotals: am.planTotals,
    pmTotals: pm.planTotals,
  };
}
