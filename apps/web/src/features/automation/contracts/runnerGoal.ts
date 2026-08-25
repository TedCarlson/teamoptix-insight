const RUNNER_GOALS: Record<string, string> = {
  PREVIOUS_DAY_CLOSE: "collect_previous_day_dsw",
  HISTORICAL_BACKFILL: "collect_historical_dsw_range",
  TARGETED_RECOVERY: "collect_targeted_artifacts",
  LAST_LOOK: "collect_last_look_artifacts",
  OPERATIONS_PULSE: "keep_operations_current",
  ROUTE_CLOSEOUT: "close_unresolved_routes",
};

export const OPERATIONS_COLLECTION_PAYLOAD_VERSION = "operations_collection_v2";

export function runnerGoalForRequestType(requestType: unknown) {
  const key = String(requestType ?? "").trim().toUpperCase();
  return RUNNER_GOALS[key] ?? "collect_governed_artifacts";
}
