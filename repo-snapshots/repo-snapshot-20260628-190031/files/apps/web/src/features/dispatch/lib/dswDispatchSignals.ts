import type { DispatchRoute } from "./dispatchSupport";

export type DswCurrentRow = {
  route_baseline_id: string | null;
  route_name: string | null;
  wa_number: string | null;
  vscan_packages: number;
  planned_delivery_stops: number;
  planned_pickup_stops: number;
};

export type DswDispatchSignal = {
  deliveryStops: number;
  packages: number;
  timeCritical: number;
  pickupStops: number;
  title: string;
};

export type DswDispatchTotals = {
  matchedRoutes: number;
  deliveryStops: number;
  packages: number;
  timeCritical: number;
  pickupStops: number;
};

function rowKey(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function buildDswDispatchSignals(routes: DispatchRoute[], rows: DswCurrentRow[]) {
  const byWa = new Map<string, DswCurrentRow>();
  const byName = new Map<string, DswCurrentRow>();
  const dswSignalsByRouteKey: Record<string, DswDispatchSignal> = {};

  for (const row of rows) {
    const wa = rowKey(row.wa_number);
    const name = rowKey(row.route_name).toLowerCase();

    if (wa) byWa.set(wa, row);
    if (name) byName.set(name, row);
  }

  const dswTotals: DswDispatchTotals = {
    matchedRoutes: 0,
    deliveryStops: 0,
    packages: 0,
    timeCritical: 0,
    pickupStops: 0,
  };

  for (const route of routes) {
    const wa = route.current_wa_num?.trim();
    const name = route.route_name?.trim().toLowerCase();
    const row = (wa ? byWa.get(wa) : null) ?? (name ? byName.get(name) : null);

    if (!row) continue;

    const deliveryStops = Number(row.planned_delivery_stops ?? 0);
    const packages = Number(row.vscan_packages ?? 0);
    const pickupStops = Number(row.planned_pickup_stops ?? 0);
    const timeCritical = 0;

    dswSignalsByRouteKey[route.route_key] = {
      deliveryStops,
      packages,
      timeCritical,
      pickupStops,
      title: `${deliveryStops} delivery stops · ${packages} scanned packages · ${pickupStops} pickup stops`,
    };

    dswTotals.matchedRoutes += 1;
    dswTotals.deliveryStops += deliveryStops;
    dswTotals.packages += packages;
    dswTotals.timeCritical += timeCritical;
    dswTotals.pickupStops += pickupStops;
  }

  return { dswSignalsByRouteKey, dswTotals };
}
