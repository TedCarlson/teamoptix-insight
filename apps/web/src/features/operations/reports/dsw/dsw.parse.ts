import type { ParsedRow, DswMeta } from "./dsw.types";

export function cellText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeHeader(value: unknown) {
  return cellText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+#/g, "#")
    .trim();
}

export function rowHasHeaders(row: unknown[], headers: string[]) {
  const normalized = new Set(row.map(normalizeHeader).filter(Boolean));
  return headers.every((header) => normalized.has(normalizeHeader(header)));
}

export function findHeaderRow(rows: unknown[][], headers: string[]) {
  return rows.findIndex((row) => rowHasHeaders(row, headers));
}

export function toNumber(value: unknown) {
  const text = cellText(value).replace(/,/g, "").replace("%", "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInteger(value: unknown) {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function objectRows(rows: unknown[][], headerIndex: number) {
  const headers = (rows[headerIndex] ?? []).map(cellText);

  return rows
    .slice(headerIndex + 1)
    .map((row, offset) => {
      const raw: ParsedRow = {};
      headers.forEach((header, index) => {
        if (header) raw[header] = row[index] ?? "";
      });
      return { source_row_index: headerIndex + 2 + offset, raw };
    })
    .filter(({ raw }) => Object.values(raw).some((value) => cellText(value)));
}

export function extractMeta(rows: unknown[][]): DswMeta {
  // DSW workbook contract: A1 owns the activity date and F1 identifies the
  // report. Never infer the load date from filenames, folders, or timestamps.
  const metaLine = cellText(rows[0]?.[0]);
  const reportTitle = cellText(rows[0]?.[5]);
  const generatedLine = cellText(rows[0]?.[10]);

  const match = metaLine?.match(
    /^FedEx - (.+?) - Contract: (.+?) - (\d{1,2}\/\d{1,2}\/\d{4})$/
  );

  return {
    report_title: reportTitle || null,
    terminal_identity: match?.[1] ?? null,
    contract_filter: match?.[2] ?? null,
    service_date_text: match?.[3] ?? null,
    generated_at_text: generatedLine.startsWith("Generated - ")
      ? generatedLine.replace("Generated - ", "")
      : null,
  };
}
