import * as XLSX from "xlsx";

export type DroFrame = "AM" | "PM";
export type DroParsedRow = Record<string, unknown>;

export const DRO_PM_HEADERS = [
  "WA NAME",
  "WA #",
  "ROUTE TYPE",
  "Distance",
  "TIME",
  "TIME COMMITS",
  "LP STOPS",
  "LP PACKAGES",
  "BULK STOPS",
  "BULK PKGS",
  "SMALL STOPS",
  "SMALL PKGS",
  "REG STOPS",
  "REG PKGS",
];

export const DRO_AM_HEADERS = [
  "SERVICE AREA",
  "WA NAME",
  "WA #",
  "ROUTE TYPE",
  "CAPACITY",
  "TIME",
  "DISTANCE",
  "TOTAL STOPS",
  "TIME CRITICAL",
  "MISSED TIME CRT.",
  "Delivery - STOPS",
  "Delivery - PKGS.",
];

export function droCellText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return droCellText(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+#/g, "#")
    .trim();
}

export function normalizeDroWaNumber(value: unknown) {
  const text = droCellText(value);
  const normalized = text.replace(/^0+/, "");
  return normalized || text;
}

function rowHasHeaders(row: unknown[], headers: string[]) {
  const normalized = new Set(row.map(normalizeHeader).filter(Boolean));
  return headers.every((header) => normalized.has(normalizeHeader(header)));
}

function findHeaderRow(rows: unknown[][], headers: string[]) {
  return rows.findIndex((row) => rowHasHeaders(row, headers));
}

function toNumber(value: unknown) {
  const text = droCellText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown) {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function detectDroPackageDetailWorkbook(workbook: XLSX.WorkBook) {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("DRO Package Detail workbook has no sheets.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[sheetName],
    { header: 1, blankrows: true, defval: "" }
  );
  const amHeaderIndex = findHeaderRow(rows, DRO_AM_HEADERS);
  const pmHeaderIndex = findHeaderRow(rows, DRO_PM_HEADERS);
  const frame: DroFrame | null =
    amHeaderIndex >= 0 ? "AM" : pmHeaderIndex >= 0 ? "PM" : null;

  if (!frame) return null;
  return {
    sheetName,
    rows,
    frame,
    headerIndex: frame === "AM" ? amHeaderIndex : pmHeaderIndex,
    detectedHeaders: frame === "AM" ? DRO_AM_HEADERS : DRO_PM_HEADERS,
  };
}

export function parseDroRows(rows: unknown[][], headerIndex: number) {
  const headers = (rows[headerIndex] ?? []).map(droCellText);
  return rows
    .slice(headerIndex + 1)
    .map((row, offset) => {
      const raw: DroParsedRow = {};
      headers.forEach((header, index) => {
        if (header) raw[header] = row[index] ?? "";
      });
      return { source_row_index: headerIndex + 2 + offset, raw };
    })
    .filter(({ raw }) =>
      Object.values(raw).some((value) => Boolean(droCellText(value)))
    );
}

export function normalizeDroRow(raw: DroParsedRow, frame: DroFrame) {
  if (frame === "AM") {
    return {
      wa_name: droCellText(raw["WA NAME"]),
      wa_number: droCellText(raw["WA #"]),
      route_type: droCellText(raw["ROUTE TYPE"]),
      distance: toNumber(raw["DISTANCE"]),
      planned_time: toNumber(raw["TIME"]),
      time_commits: toInteger(raw["TIME CRITICAL"]) ?? 0,
      lp_stops: toInteger(raw["TOTAL STOPS"]) ?? 0,
      lp_packages: toInteger(raw["Delivery - PKGS."]) ?? 0,
      bulk_stops: 0,
      bulk_packages: 0,
      small_stops: 0,
      small_packages: 0,
      reg_stops: 0,
      reg_packages: 0,
    };
  }

  return {
    wa_name: droCellText(raw["WA NAME"]),
    wa_number: droCellText(raw["WA #"]),
    route_type: droCellText(raw["ROUTE TYPE"]),
    distance: toNumber(raw["Distance"]),
    planned_time: toNumber(raw["TIME"]),
    time_commits: toInteger(raw["TIME COMMITS"]) ?? 0,
    lp_stops: toInteger(raw["LP STOPS"]) ?? 0,
    lp_packages: toInteger(raw["LP PACKAGES"]) ?? 0,
    bulk_stops: toInteger(raw["BULK STOPS"]) ?? 0,
    bulk_packages: toInteger(raw["BULK PKGS"]) ?? 0,
    small_stops: toInteger(raw["SMALL STOPS"]) ?? 0,
    small_packages: toInteger(raw["SMALL PKGS"]) ?? 0,
    reg_stops: toInteger(raw["REG STOPS"]) ?? 0,
    reg_packages: toInteger(raw["REG PKGS"]) ?? 0,
  };
}
