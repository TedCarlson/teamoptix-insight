import {
  DELIVERY_PACKAGE_DETAIL_HEADERS,
  DELIVERY_STOP_DETAIL_HEADERS,
  findManifestHeaderRow,
  MANIFEST_HEADER_SHEET_NAME,
  MANIFEST_PACKAGE_DETAILS_SHEET_NAME,
  MANIFEST_STOP_DETAILS_SHEET_NAME,
  missingManifestHeaders,
} from "./manifest.headers";
import { ManifestMetadata, parseManifestMetadata } from "./manifest.metadata";
import { deriveManifestServiceFlags } from "./manifest.serviceFlags";
import {
  ManifestSheetRows,
  parseManifestTable,
  readCell,
  readIntegerCell,
} from "./manifest.table";

export type DeliveryManifestSheets = {
  [MANIFEST_HEADER_SHEET_NAME]: ManifestSheetRows;
  [MANIFEST_STOP_DETAILS_SHEET_NAME]: ManifestSheetRows;
  [MANIFEST_PACKAGE_DETAILS_SHEET_NAME]: ManifestSheetRows;
};

export type DeliveryManifestStopRow = {
  st_number: string;
  sid: string;
  package_count: number | null;
  recipient: string;
  contact_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  stop_instructions: string;
  phone: string;
  completed: string;
  delivery_time_begin: string;
  delivery_time_end: string;
};

export type DeliveryManifestPackageRow = {
  st_number: string;
  sid: string;
  recipient: string;
  contact_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  tracking_id: string;
  prem_svc_raw: string;
  is_express: boolean;
  is_residential: boolean;
  is_signature: boolean;
  is_hazmat: boolean;
  is_collection: boolean;
};

export type DeliveryManifestParseResult = {
  metadata: ManifestMetadata;
  stopDetail: {
    rows: DeliveryManifestStopRow[];
    headerRowIndex: number;
    parsedRowCount: number;
    skippedRowCount: number;
  };
  packageDetail: {
    rows: DeliveryManifestPackageRow[];
    headerRowIndex: number;
    parsedRowCount: number;
    skippedRowCount: number;
  };
};

export function parseDeliveryManifestStopDetail(rows: ManifestSheetRows) {
  const headerRowIndex = findManifestHeaderRow(rows, DELIVERY_STOP_DETAIL_HEADERS);

  if (headerRowIndex < 0) {
    throw new Error("Delivery Manifest Stop Details headers were not detected.");
  }

  const missing = missingManifestHeaders(rows[headerRowIndex] ?? [], DELIVERY_STOP_DETAIL_HEADERS);
  if (missing.length > 0) {
    throw new Error(`Delivery Manifest Stop Details is missing headers: ${missing.join(", ")}`);
  }

  return parseManifestTable({
    rows,
    headerRowIndex,
    parseRow(row, headerIndex) {
      const stNumber = readCell(row, headerIndex, "ST#");
      const sid = readCell(row, headerIndex, "SID");
      const recipient = readCell(row, headerIndex, "Recipient");

      if (!stNumber && !sid && !recipient) return null;

      return {
        st_number: stNumber,
        sid,
        package_count: readIntegerCell(row, headerIndex, "# Pkgs"),
        recipient,
        contact_name: readCell(row, headerIndex, "Contact Name"),
        address_line_1: readCell(row, headerIndex, "Address Line 1"),
        address_line_2: readCell(row, headerIndex, "Address Line 2"),
        city: readCell(row, headerIndex, "City"),
        state: readCell(row, headerIndex, "State"),
        postal_code: readCell(row, headerIndex, "Postal Code"),
        stop_instructions: readCell(row, headerIndex, "Stop Instructions"),
        phone: readCell(row, headerIndex, "Phone"),
        completed: readCell(row, headerIndex, "Completed"),
        delivery_time_begin: readCell(row, headerIndex, "DeliveryTimeBegin"),
        delivery_time_end: readCell(row, headerIndex, "DeliveryTimeEnd"),
      };
    },
  });
}

export function parseDeliveryManifestPackageDetail(rows: ManifestSheetRows) {
  const headerRowIndex = findManifestHeaderRow(rows, DELIVERY_PACKAGE_DETAIL_HEADERS);

  if (headerRowIndex < 0) {
    throw new Error("Delivery Manifest Package Details headers were not detected.");
  }

  const missing = missingManifestHeaders(rows[headerRowIndex] ?? [], DELIVERY_PACKAGE_DETAIL_HEADERS);
  if (missing.length > 0) {
    throw new Error(`Delivery Manifest Package Details is missing headers: ${missing.join(", ")}`);
  }

  return parseManifestTable({
    rows,
    headerRowIndex,
    parseRow(row, headerIndex) {
      const trackingId = readCell(row, headerIndex, "Track ID");
      const stNumber = readCell(row, headerIndex, "ST#");
      const sid = readCell(row, headerIndex, "SID");

      if (!trackingId && !stNumber && !sid) return null;

      const premSvcRaw = readCell(row, headerIndex, "Prem Svc");
      const flags = deriveManifestServiceFlags(premSvcRaw);

      return {
        st_number: stNumber,
        sid,
        recipient: readCell(row, headerIndex, "Recipient"),
        contact_name: readCell(row, headerIndex, "Contact Name"),
        address_line_1: readCell(row, headerIndex, "Address Line 1"),
        address_line_2: readCell(row, headerIndex, "Address Line 2"),
        city: readCell(row, headerIndex, "City"),
        state: readCell(row, headerIndex, "State"),
        postal_code: readCell(row, headerIndex, "Postal Code"),
        tracking_id: trackingId,
        prem_svc_raw: premSvcRaw,
        ...flags,
      };
    },
  });
}

export function parseDeliveryManifest(sheets: DeliveryManifestSheets): DeliveryManifestParseResult {
  return {
    metadata: parseManifestMetadata(sheets.Header),
    stopDetail: parseDeliveryManifestStopDetail(sheets["Stop Details"]),
    packageDetail: parseDeliveryManifestPackageDetail(sheets["Package Details"]),
  };
}
