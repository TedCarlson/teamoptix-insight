export const MANIFEST_HEADER_SHEET_NAME = "Header";
export const MANIFEST_STOP_DETAILS_SHEET_NAME = "Stop Details";
export const MANIFEST_PACKAGE_DETAILS_SHEET_NAME = "Package Details";

export const DELIVERY_STOP_DETAIL_HEADERS = [
  "ST#",
  "SID",
  "# Pkgs",
  "Recipient",
  "Contact Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Stop Instructions",
  "Phone",
  "Completed",
  "DeliveryTimeBegin",
  "DeliveryTimeEnd",
] as const;

export const DELIVERY_PACKAGE_DETAIL_HEADERS = [
  "ST#",
  "SID",
  "Recipient",
  "Contact Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Track ID",
  "Prem Svc",
] as const;

export const PICKUP_STOP_DETAIL_HEADERS = [
  "PU List",
  "Station",
  "WA",
  "PUID",
  "Type",
  "# Pkgs",
  "Shipper #",
  "Shipper Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Origin Station & WA#",
  "Ready",
  "Close",
  "PU Closed",
  "Reas Code",
  "Pkgs Picked Up",
] as const;

export function normalizeManifestHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildHeaderIndex(row: readonly unknown[]) {
  const index = new Map<string, number>();

  row.forEach((cell, cellIndex) => {
    const normalized = normalizeManifestHeader(cell);
    if (normalized && !index.has(normalized)) {
      index.set(normalized, cellIndex);
    }
  });

  return index;
}

export function findManifestHeaderRow(
  rows: readonly (readonly unknown[])[],
  requiredHeaders: readonly string[]
) {
  const required = requiredHeaders.map(normalizeManifestHeader);

  return rows.findIndex((row) => {
    const index = buildHeaderIndex(row);
    return required.every((header) => index.has(header));
  });
}

export function missingManifestHeaders(
  row: readonly unknown[],
  requiredHeaders: readonly string[]
) {
  const index = buildHeaderIndex(row);

  return requiredHeaders.filter((header) => {
    return !index.has(normalizeManifestHeader(header));
  });
}
