import type { DispatchRoute } from "./dispatchSupport";

export type DswCurrentRow = {
  batch_id?: string | null;
  generated_at_text?: string | null;
  route_baseline_id: string | null;
  route_name: string | null;
  wa_number: string | null;
  driver_name?: string | null;
  matched_roster_member_id?: string | null;
  matched_roster_full_name?: string | null;
  vscan_packages: number;
  planned_delivery_stops: number;
  planned_pickup_stops: number;
  actual_delivery_stops?: number;
  actual_delivery_packages?: number;
  actual_pickup_stops?: number;
  actual_pickup_packages?: number;
  ils_percent?: number | string | null;
  miles?: number | null;
};

export type DswDispatchSignal = {
  batchId: string | null;
  generatedAtText: string | null;
  driverName: string | null;
  matchedRosterMemberId: string | null;
  scannerRole: "driver" | "helper" | "trainee";
  deliveryStops: number;
  packages: number;
  timeCritical: number;
  pickupStops: number;
  actualDeliveryStops: number;
  actualDeliveryPackages: number;
  actualPickupStops: number;
  actualPickupPackages: number;
  ilsPercent: number | string | null;
  miles: number | null;
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

function personKey(value: string | null | undefined) {
  return rowKey(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function scannerRoleForRoute(route: DispatchRoute, row: DswCurrentRow) {
  const rosterId = rowKey(row.matched_roster_member_id);
  const name = personKey(row.matched_roster_full_name || row.driver_name);
  const matches = (
    people: Array<{ roster_member_id: string; full_name: string }>
  ) =>
    people.some(
      (person) =>
        (rosterId && person.roster_member_id === rosterId) ||
        (name && personKey(person.full_name) === name)
    );

  if (matches(route.helpers)) return "helper" as const;
  if (matches(route.trainees)) return "trainee" as const;
  return "driver" as const;
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
    const actualDeliveryStops = Number(row.actual_delivery_stops ?? 0);
    const actualDeliveryPackages = Number(row.actual_delivery_packages ?? 0);
    const actualPickupStops = Number(row.actual_pickup_stops ?? 0);
    const actualPickupPackages = Number(row.actual_pickup_packages ?? 0);
    const timeCritical = 0;

    dswSignalsByRouteKey[route.route_key] = {
      batchId: rowKey(row.batch_id) || null,
      generatedAtText: rowKey(row.generated_at_text) || null,
      driverName:
        rowKey(row.matched_roster_full_name) ||
        rowKey(row.driver_name) ||
        null,
      matchedRosterMemberId:
        rowKey(row.matched_roster_member_id) || null,
      scannerRole: scannerRoleForRoute(route, row),
      deliveryStops,
      packages,
      timeCritical,
      pickupStops,
      actualDeliveryStops,
      actualDeliveryPackages,
      actualPickupStops,
      actualPickupPackages,
      ilsPercent: row.ils_percent ?? null,
      miles: row.miles ?? null,
      title: `${actualDeliveryStops}/${deliveryStops} delivery stops · ${actualDeliveryPackages}/${packages} delivered packages · ${actualPickupStops}/${pickupStops} pickups`,
    };

    dswTotals.matchedRoutes += 1;
    dswTotals.deliveryStops += deliveryStops;
    dswTotals.packages += packages;
    dswTotals.timeCritical += timeCritical;
    dswTotals.pickupStops += pickupStops;
  }

  return { dswSignalsByRouteKey, dswTotals };
}
