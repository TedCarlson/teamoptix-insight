import type {
  DispatchPerson,
  DispatchRoute,
  RouteRow,
} from "@/features/dispatch/lib/dispatchSupport";

export type HistoricalDswRoute = {
  route_name?: string | null;
  wa_number?: string | null;
  driver_name?: string | null;
  matched_roster_member_id?: string | null;
  matched_roster_full_name?: string | null;
};

export type HistoricalFccRoute = {
  wa_number?: string | null;
  wa_number_normalized?: string | null;
  source_wa_number?: string | null;
};

export type HistoricalManifestRoute = {
  route_key?: string | null;
  route_label?: string | null;
};

function text(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function identity(value: string | null | undefined) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function waIdentity(value: string | null | undefined) {
  const raw = text(value).replace(/^wa\s*/i, "");
  const numeric = raw.match(/\d+/)?.[0] ?? raw;
  return numeric.replace(/^0+/, "") || numeric;
}

function routePerson(row: HistoricalDswRoute, routeKey: string): DispatchPerson | null {
  const fullName = text(row.matched_roster_full_name || row.driver_name);
  if (!fullName) return null;

  return {
    roster_member_id:
      text(row.matched_roster_member_id) || `dsw:${routeKey}:${identity(fullName)}`,
    full_name: fullName,
    worker_type: null,
    source_kind: "DSW_SELECTED_DATE",
    override_type: null,
  };
}

function configuredMatch(
  routes: RouteRow[],
  waNumber: string,
  routeName: string
) {
  const waKey = waIdentity(waNumber);
  const nameKey = identity(routeName);
  return (
    routes.find((route) => waKey && waIdentity(route.current_wa_num) === waKey) ??
    routes.find((route) => nameKey && identity(route.route_name) === nameKey) ??
    null
  );
}

export function buildHistoricalServiceRoutes({
  configuredRoutes,
  dswRows,
  fccRows,
  manifestRoutes,
}: {
  configuredRoutes: RouteRow[];
  dswRows: HistoricalDswRoute[];
  fccRows: HistoricalFccRoute[];
  manifestRoutes: HistoricalManifestRoute[];
}) {
  const routes = new Map<string, DispatchRoute>();
  const aliases = new Map<string, string>();

  function addRoute(
    waNumberValue: string | null | undefined,
    routeNameValue: string | null | undefined,
    driver: DispatchPerson | null = null
  ) {
    const waNumber = waIdentity(waNumberValue);
    const routeName = text(routeNameValue);
    const configured = configuredMatch(configuredRoutes, waNumber, routeName);
    const key = waNumber || text(configured?.current_wa_num) || routeName;
    if (!key) return;

    const existing = routes.get(key);
    routes.set(key, {
      route_key: key,
      route_name:
        routeName || configured?.route_name?.trim() || existing?.route_name || key,
      current_wa_num:
        waNumber || configured?.current_wa_num || existing?.current_wa_num || null,
      route_location:
        configured?.route_location ?? existing?.route_location ?? null,
      route_type: configured?.route_type ?? existing?.route_type ?? null,
      driver: driver ?? existing?.driver ?? null,
      helpers: existing?.helpers ?? [],
      trainees: existing?.trainees ?? [],
      extras: existing?.extras ?? [],
    });

    for (const alias of [key, waNumber, routeName, configured?.route_name]) {
      const normalized = identity(alias);
      if (normalized) aliases.set(normalized, key);
    }
  }

  for (const row of dswRows) {
    const routeKey = waIdentity(row.wa_number) || text(row.route_name);
    addRoute(row.wa_number, row.route_name, routePerson(row, routeKey));
  }

  for (const row of fccRows) {
    addRoute(
      row.wa_number_normalized || row.wa_number || row.source_wa_number,
      null
    );
  }

  for (const route of manifestRoutes) {
    addRoute(route.route_key, route.route_label);
  }

  return { routes, aliases };
}
