import { buildHeaderIndex, normalizeManifestHeader } from "./manifest.headers";

export type ManifestCellValue = string | number | boolean | Date | null | undefined;

export type ManifestSheetRows = readonly (readonly ManifestCellValue[])[];

export type ManifestTableParseResult<T> = {
  rows: T[];
  headerRowIndex: number;
  parsedRowCount: number;
  skippedRowCount: number;
};

export function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export function cellInteger(value: unknown) {
  const raw = cellText(value).replace(/,/g, "");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  return Math.trunc(parsed);
}

export function readCell(
  row: readonly unknown[],
  headerIndex: ReadonlyMap<string, number>,
  header: string
) {
  const cellIndex = headerIndex.get(normalizeManifestHeader(header));
  if (cellIndex === undefined) return "";

  return cellText(row[cellIndex]);
}

export function readIntegerCell(
  row: readonly unknown[],
  headerIndex: ReadonlyMap<string, number>,
  header: string
) {
  const cellIndex = headerIndex.get(normalizeManifestHeader(header));
  if (cellIndex === undefined) return null;

  return cellInteger(row[cellIndex]);
}

export function parseManifestTable<T>(params: {
  rows: ManifestSheetRows;
  headerRowIndex: number;
  parseRow: (row: readonly ManifestCellValue[], headerIndex: ReadonlyMap<string, number>) => T | null;
}) {
  const headerRow = params.rows[params.headerRowIndex];
  if (!headerRow) {
    throw new Error("Manifest header row was not found.");
  }

  const headerIndex = buildHeaderIndex(headerRow);
  const rows: T[] = [];
  let skippedRowCount = 0;

  for (const row of params.rows.slice(params.headerRowIndex + 1)) {
    const hasAnyValue = row.some((cell) => cellText(cell));
    if (!hasAnyValue) {
      skippedRowCount += 1;
      continue;
    }

    const parsed = params.parseRow(row, headerIndex);
    if (parsed) {
      rows.push(parsed);
    } else {
      skippedRowCount += 1;
    }
  }

  return {
    rows,
    headerRowIndex: params.headerRowIndex,
    parsedRowCount: rows.length,
    skippedRowCount,
  } satisfies ManifestTableParseResult<T>;
}
