import type { DswClassifiedRow } from "./dsw.classify";
import { cellText } from "./dsw.parse";

export function buildClassificationSummary(rows: DswClassifiedRow[]) {
  return {
    route_count: rows.filter((row) => row.row_kind === "ROUTE").length,
    route_candidate_count: rows.filter((row) => row.row_kind === "ROUTE_CANDIDATE").length,
    route_breakout_count: rows.filter((row) => row.row_kind === "ROUTE_BREAKOUT").length,
    summary_count: rows.filter((row) => row.row_kind === "SUMMARY").length,
  };
}

export function buildCandidatePreview(rows: DswClassifiedRow[], limit = 25) {
  return rows
    .filter((row) => row.row_kind === "ROUTE_CANDIDATE")
    .slice(0, limit)
    .map((row) => {
      const raw = row.raw;

      return {
        source_row_index: row.source_row_index,
        parent_source_row_index: row.parent_source_row_index ?? null,
        parent_route_key: row.parent_route_key ?? null,
        parent_wa_number: row.parent_wa_number ?? null,
        parent_driver_name: row.parent_driver_name ?? null,

        service_area: cellText(raw["Svc Area #"]) || null,
        wa_name: cellText(raw["WA Name"]) || null,
        vehicle_text: cellText(raw["Veh #"]) || null,
        driver_name: cellText(raw["Driver Name"]) || null,
        wa_number: cellText(raw["WA#"]) || null,

        vscan_packages: cellText(raw["VScan Pkgs"]) || null,
        planned_delivery_stops: cellText(raw["Del Stps"]) || null,
        planned_pickup_stops: cellText(raw["PU Stps"]) || null,
        diff: cellText(raw["DIFF"]) || null,
        actual_delivery_stops: cellText(raw["Act Del Stps"]) || null,
        actual_delivery_packages: cellText(raw["Act Del Pkgs"]) || null,
        actual_pickup_stops: cellText(raw["Act PU Stps"]) || null,
        actual_pickup_packages: cellText(raw["Act PU Pkgs"]) || null,

        ils_percent: cellText(raw["ILS%"]) || null,
        ils_impact_packages: cellText(raw["ILS Impact Pkgs"]) || null,
        non_delivered_stops: cellText(raw["Non Delvd Stps"]) || null,
        code_85: cellText(raw["Code 85"]) || null,
        all_status_code_packages: cellText(raw["All Status Code Pkgs"]) || null,
      };
    });
}
