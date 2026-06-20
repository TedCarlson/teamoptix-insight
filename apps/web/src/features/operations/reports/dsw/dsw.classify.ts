import { cellText } from "./dsw.parse";
import type { DswRowKind, ParsedRow } from "./dsw.types";
import { summaryScope } from "./dsw.metadata";

export type DswClassifiedRow = {
  source_row_index: number;
  raw: ParsedRow;
  row_kind: DswRowKind;
  parent_source_row_index?: number | null;
  parent_route_key?: string | null;
  parent_wa_number?: string | null;
  parser_note?: string | null;
};

export function classifyDswRows(
  rows: Array<{ source_row_index: number; raw: ParsedRow }>
): DswClassifiedRow[] {
  return rows
    .filter(({ raw }) => {
      const first = cellText(raw["Svc Area #"]);
      if (!first) return false;
      if (first.startsWith("Access is restricted")) return false;
      if (first.startsWith("Due to stop rate")) return false;

      return (
        cellText(raw["WA Name"]) ||
        cellText(raw["WA#"]) ||
        Boolean(summaryScope(first))
      );
    })
    .map(({ source_row_index, raw }) => ({
      source_row_index,
      raw,
      row_kind: summaryScope(cellText(raw["Svc Area #"]))
        ? "SUMMARY"
        : "ROUTE",
    }));
}
