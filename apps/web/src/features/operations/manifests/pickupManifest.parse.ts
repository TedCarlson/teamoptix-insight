import {
  findManifestHeaderRow,
  MANIFEST_HEADER_SHEET_NAME,
  MANIFEST_STOP_DETAILS_SHEET_NAME,
  missingManifestHeaders,
  PICKUP_STOP_DETAIL_HEADERS,
} from "./manifest.headers";
import { ManifestMetadata, parseManifestMetadata } from "./manifest.metadata";
import {
  ManifestSheetRows,
  parseManifestTable,
  readCell,
  readIntegerCell,
} from "./manifest.table";

export type PickupManifestSheets = {
  [MANIFEST_HEADER_SHEET_NAME]: ManifestSheetRows;
  [MANIFEST_STOP_DETAILS_SHEET_NAME]: ManifestSheetRows;
};

export type PickupManifestStopRow = {
  pickup_list: string;
  station: string;
  wa: string;
  puid: string;
  pickup_type: string;
  package_count_expected: number | null;
  shipper_number: string;
  shipper_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  origin_station_and_wa: string;
  ready_at: string;
  close_at: string;
  pu_closed_at: string;
  reason_code: string;
  packages_picked_up: number | null;
};

export type PickupManifestParseResult = {
  metadata: ManifestMetadata;
  pickupDetail: {
    rows: PickupManifestStopRow[];
    headerRowIndex: number;
    parsedRowCount: number;
    skippedRowCount: number;
  };
};

export function parsePickupManifestStopDetail(rows: ManifestSheetRows) {
  const headerRowIndex = findManifestHeaderRow(rows, PICKUP_STOP_DETAIL_HEADERS);

  if (headerRowIndex < 0) {
    throw new Error("Pickup Manifest Stop Details headers were not detected.");
  }

  const missing = missingManifestHeaders(rows[headerRowIndex] ?? [], PICKUP_STOP_DETAIL_HEADERS);
  if (missing.length > 0) {
    throw new Error(`Pickup Manifest Stop Details is missing headers: ${missing.join(", ")}`);
  }

  return parseManifestTable({
    rows,
    headerRowIndex,
    parseRow(row, headerIndex) {
      const puid = readCell(row, headerIndex, "PUID");
      const pickupList = readCell(row, headerIndex, "PU List");
      const shipperName = readCell(row, headerIndex, "Shipper Name");

      if (!puid && !pickupList && !shipperName) return null;

      return {
        pickup_list: pickupList,
        station: readCell(row, headerIndex, "Station"),
        wa: readCell(row, headerIndex, "WA"),
        puid,
        pickup_type: readCell(row, headerIndex, "Type"),
        package_count_expected: readIntegerCell(row, headerIndex, "# Pkgs"),
        shipper_number: readCell(row, headerIndex, "Shipper #"),
        shipper_name: shipperName,
        address_line_1: readCell(row, headerIndex, "Address Line 1"),
        address_line_2: readCell(row, headerIndex, "Address Line 2"),
        city: readCell(row, headerIndex, "City"),
        state: readCell(row, headerIndex, "State"),
        postal_code: readCell(row, headerIndex, "Postal Code"),
        origin_station_and_wa: readCell(row, headerIndex, "Origin Station & WA#"),
        ready_at: readCell(row, headerIndex, "Ready"),
        close_at: readCell(row, headerIndex, "Close"),
        pu_closed_at: readCell(row, headerIndex, "PU Closed"),
        reason_code: readCell(row, headerIndex, "Reas Code"),
        packages_picked_up: readIntegerCell(row, headerIndex, "Pkgs Picked Up"),
      };
    },
  });
}

export function parsePickupManifest(sheets: PickupManifestSheets): PickupManifestParseResult {
  return {
    metadata: parseManifestMetadata(sheets.Header),
    pickupDetail: parsePickupManifestStopDetail(sheets["Stop Details"]),
  };
}
