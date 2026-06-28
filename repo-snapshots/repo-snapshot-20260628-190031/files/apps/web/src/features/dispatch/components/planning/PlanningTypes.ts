import type { DispatchRoute } from "../../lib/dispatchSupport";
import type { DroPlanRow } from "../../lib/droPlanSignals";

export type PlanningSnapshot = {
  planning_date: string;
  locked_at: string;
  route_sort_key: "route_name" | "current_wa_num";
  routes: DispatchRoute[];
};

export type PlanningWorkspaceProps = {
  slug: string;
  planningDate: string;
  routeSortKey: "route_name" | "current_wa_num";
  planningRoutes: DispatchRoute[];
  droPlanRows: DroPlanRow[];
  droPlanSourceFrame: "AM" | "PM" | null;
};
