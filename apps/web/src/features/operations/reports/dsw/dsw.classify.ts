import { cellText } from "./dsw.parse";
import type { DswRowKind, ParsedRow } from "./dsw.types";
import { summaryScope } from "./dsw.metadata";
import {
  isBreakoutRow,
  isRouteRow,
  looksLikeContinuationRow,
  type DswBreakoutContext,
} from "./dsw.breakout";

export type DswClassifiedRow = {
  source_row_index: number;
  raw: ParsedRow;
  row_kind: DswRowKind;
  parent_source_row_index?: number | null;
  parent_route_key?: string | null;
  parent_wa_number?: string | null;
  parent_driver_name?: string | null;
  parser_note?: string | null;
};

export function classifyDswRows(
  rows: Array<{ source_row_index: number; raw: ParsedRow }>
): DswClassifiedRow[] {
  const classifiedRows: DswClassifiedRow[] = [];

  let context: DswBreakoutContext = {
    parent_source_row_index: null,
    parent_route_key: null,
    parent_wa_number: null,
    parent_driver_name: null,
  };

  for (const { source_row_index, raw } of rows) {
    const first = cellText(raw["Svc Area #"]);

    if (!first) continue;
    if (first.startsWith("Access is restricted")) continue;
    if (first.startsWith("Due to stop rate")) continue;

    const isSummary = Boolean(summaryScope(first));
    const routeSignal = Boolean(cellText(raw["WA Name"]) || cellText(raw["WA#"]));
    const continuationSignal = looksLikeContinuationRow(raw);

    if (!isSummary && !routeSignal && !continuationSignal) continue;

    if (!isSummary && isRouteRow(raw)) {
      context = {
        parent_source_row_index: source_row_index,
        parent_route_key: cellText(raw["WA Name"]) || cellText(raw["WA#"]) || null,
        parent_wa_number: cellText(raw["WA#"]) || null,
        parent_driver_name: cellText(raw["Driver Name"]) || null,
      };
    }

    const rowKind: DswRowKind = isSummary
      ? "SUMMARY"
      : continuationSignal
        ? "ROUTE_CANDIDATE"
        : isBreakoutRow(raw)
          ? "ROUTE_BREAKOUT"
          : "ROUTE";

    const carriesParentContext =
      rowKind === "ROUTE_BREAKOUT" || rowKind === "ROUTE_CANDIDATE";

    classifiedRows.push({
      source_row_index,
      raw,
      row_kind: rowKind,
      parent_source_row_index: carriesParentContext ? context.parent_source_row_index : null,
      parent_route_key: carriesParentContext ? context.parent_route_key : null,
      parent_wa_number: carriesParentContext ? context.parent_wa_number : null,
      parent_driver_name: carriesParentContext ? context.parent_driver_name : null,
      parser_note: null,
    });
  }

  return classifiedRows;
}
