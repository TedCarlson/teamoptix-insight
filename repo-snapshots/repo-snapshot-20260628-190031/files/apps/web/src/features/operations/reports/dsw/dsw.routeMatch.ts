import type { ParsedRow } from "./dsw.types";
import { cellText } from "./dsw.parse";

export type DswRouteBaselineRow = {
  id: string;
  route_name: string | null;
  current_wa_num: string | null;
  effective_start: string | null;
  effective_end: string | null;
};

export function routeActiveOn(route: DswRouteBaselineRow, serviceDate: string) {
  const start = cellText(route.effective_start);
  const end = cellText(route.effective_end);
  if (start && start > serviceDate) return false;
  if (end && end < serviceDate) return false;
  return true;
}

export function findRouteMatch(
  raw: ParsedRow,
  routes: DswRouteBaselineRow[],
  serviceDate: string
) {
  const waName = cellText(raw["WA Name"]);
  const waNumber = cellText(raw["WA#"]);
  const scoped = routes.filter((route) => routeActiveOn(route, serviceDate));

  const byWaScoped = scoped.find((route) => cellText(route.current_wa_num) === waNumber);
  if (byWaScoped) return { id: byWaScoped.id, method: "WA_NUMBER_DATE_SCOPED" };

  const byNameScoped = scoped.find(
    (route) => cellText(route.route_name).toLowerCase() === waName.toLowerCase()
  );
  if (byNameScoped) return { id: byNameScoped.id, method: "ROUTE_NAME_DATE_SCOPED" };

  const byWa = routes.find((route) => cellText(route.current_wa_num) === waNumber);
  if (byWa) return { id: byWa.id, method: "WA_NUMBER_ANY_ACTIVE" };

  const byName = routes.find(
    (route) => cellText(route.route_name).toLowerCase() === waName.toLowerCase()
  );
  if (byName) return { id: byName.id, method: "ROUTE_NAME_ANY_ACTIVE" };

  return { id: null, method: "NONE" };
}
