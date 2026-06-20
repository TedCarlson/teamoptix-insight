import type { ParsedRow } from "./dsw.types";

export type DswBreakoutContext = {
  parent_source_row_index: number | null;
  parent_route_key: string | null;
  parent_wa_number: string | null;
};

export function isBreakoutRow(
  _raw: ParsedRow,
  _previousRaw?: ParsedRow
): boolean {
  // BREAKOUT detection intentionally disabled.
  // This seam exists so we can introduce worksheet-aware
  // classification later without rewriting classify.ts.
  return false;
}
