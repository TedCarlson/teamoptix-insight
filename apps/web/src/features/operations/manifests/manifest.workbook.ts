import * as XLSX from "xlsx";
import {
  MANIFEST_HEADER_SHEET_NAME,
  MANIFEST_PACKAGE_DETAILS_SHEET_NAME,
  MANIFEST_STOP_DETAILS_SHEET_NAME,
} from "./manifest.headers";
import { ManifestCellValue, ManifestSheetRows } from "./manifest.table";

export type ManifestWorkbookSheets = Record<string, ManifestSheetRows>;

export function worksheetToManifestRows(worksheet: XLSX.WorkSheet): ManifestSheetRows {
  return XLSX.utils.sheet_to_json<ManifestCellValue[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
}

export function readManifestWorkbook(buffer: Buffer): ManifestWorkbookSheets {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
  });

  const sheets: ManifestWorkbookSheets = {};

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    sheets[sheetName] = worksheetToManifestRows(worksheet);
  }

  return sheets;
}

export function requireManifestSheet(
  sheets: ManifestWorkbookSheets,
  sheetName: string
): ManifestSheetRows {
  const rows = sheets[sheetName];

  if (!rows) {
    throw new Error(`Manifest workbook is missing required sheet: ${sheetName}`);
  }

  return rows;
}

export function deliveryManifestSheetsFromWorkbook(sheets: ManifestWorkbookSheets) {
  return {
    [MANIFEST_HEADER_SHEET_NAME]: requireManifestSheet(sheets, MANIFEST_HEADER_SHEET_NAME),
    [MANIFEST_STOP_DETAILS_SHEET_NAME]: requireManifestSheet(
      sheets,
      MANIFEST_STOP_DETAILS_SHEET_NAME
    ),
    [MANIFEST_PACKAGE_DETAILS_SHEET_NAME]: requireManifestSheet(
      sheets,
      MANIFEST_PACKAGE_DETAILS_SHEET_NAME
    ),
  };
}

export function pickupManifestSheetsFromWorkbook(sheets: ManifestWorkbookSheets) {
  return {
    [MANIFEST_HEADER_SHEET_NAME]: requireManifestSheet(sheets, MANIFEST_HEADER_SHEET_NAME),
    [MANIFEST_STOP_DETAILS_SHEET_NAME]: requireManifestSheet(
      sheets,
      MANIFEST_STOP_DETAILS_SHEET_NAME
    ),
  };
}
