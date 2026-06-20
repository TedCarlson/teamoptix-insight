import type { ParsedRow } from "./dsw.types";
import { cellText } from "./dsw.parse";

export type DswBreakoutContext = {
  parent_source_row_index: number | null;
  parent_route_key: string | null;
  parent_wa_number: string | null;
  parent_driver_name: string | null;
};

export function isRouteRow(raw: ParsedRow) {
  return Boolean(cellText(raw["WA Name"]) && cellText(raw["WA#"]));
}

export function looksLikeContinuationRow(raw: ParsedRow) {
  return Boolean(
    !cellText(raw["WA Name"]) &&
      cellText(raw["WA#"]) &&
      (
        cellText(raw["Driver Name"]) ||
        cellText(raw["Act Del Stps"]) ||
        cellText(raw["Act Del Pkgs"]) ||
        cellText(raw["Code 85"]) ||
        cellText(raw["Non Delvd Stps"])
      )
  );
}

export function isBreakoutRow(
  _raw: ParsedRow,
  _previousRaw?: ParsedRow
): boolean {
  // BREAKOUT detection intentionally disabled.
  // This seam exists so we can introduce worksheet-aware
  // classification later without rewriting classify.ts.
  return false;
}
