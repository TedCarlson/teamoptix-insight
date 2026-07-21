import { parseManifestMetadata, type ManifestMetadata } from "./manifest.metadata";
import { readManifestWorkbook, type ManifestWorkbookSheets } from "./manifest.workbook";

export type ManifestIdentity = {
  manifest_type: "delivery" | "pickup";
  service_date: string;
  service_area: string | null;
  route_key: string;
  route_label: string;
  raw_work_area: string;
  source_page: string;
  canonical_filename: string;
  header_metadata: ManifestMetadata;
};

function normalizePage(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseServiceDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) throw new Error("Manifest Header Date is missing or invalid.");
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseWorkArea(value: string) {
  const match = value.trim().match(/^0*(\d{1,4})(?:\s+(.*))?$/);
  if (!match) throw new Error("Manifest Header WA# is missing or invalid.");
  const routeKey = String(Number(match[1]));
  return {
    routeKey,
    routeLabel: match[2]?.trim() || `WA ${routeKey}`,
  };
}

export function manifestIdentityFromWorkbook(sheets: ManifestWorkbookSheets): ManifestIdentity {
  const headerRows = sheets.Header;
  if (!headerRows) throw new Error("Manifest workbook is missing required sheet: Header");

  const header = parseManifestMetadata(headerRows);
  const page = normalizePage(header.page);
  const manifestType = page === "delivery manifest"
    ? "delivery"
    : page === "pickup manifest"
      ? "pickup"
      : null;
  if (!manifestType) throw new Error(`Manifest Header Page is unsupported: ${header.page || "blank"}.`);

  const serviceDate = parseServiceDate(header.service_date);
  const workArea = parseWorkArea(header.work_area);
  const dateKey = serviceDate.replaceAll("-", "");
  const serviceArea = header.service_area.trim() || null;
  const rawWorkArea = header.work_area.trim();
  const canonicalRouteKey = workArea.routeKey.padStart(4, "0");
  const canonicalFilename = manifestType === "pickup"
    ? `PM${dateKey}_${serviceArea ?? "UNKNOWN"}_${canonicalRouteKey}.xls`
    : `${dateKey}_${canonicalRouteKey} ${workArea.routeLabel}.xls`;

  return {
    manifest_type: manifestType,
    service_date: serviceDate,
    service_area: serviceArea,
    route_key: workArea.routeKey,
    route_label: workArea.routeLabel,
    raw_work_area: rawWorkArea,
    source_page: header.page,
    canonical_filename: canonicalFilename,
    header_metadata: header,
  };
}

export function manifestIdentityFromBuffer(buffer: Buffer) {
  return manifestIdentityFromWorkbook(readManifestWorkbook(buffer));
}
