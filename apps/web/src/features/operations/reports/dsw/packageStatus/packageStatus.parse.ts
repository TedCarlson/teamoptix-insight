import * as XLSX from "xlsx";

export const DSW_PACKAGE_STATUS_HEADERS = [
  "Pkg Cnt",
  "Work Area Name",
  "WA#",
  "PSA/CSA",
  "Service Provider",
  "Vision Label",
  "Tracking ID",
  "Destination Address",
  "Vehicle #",
  "VSA Status Code",
  "STAR Status Code",
  "STAR Scan Time",
] as const;

export type DswPackageStatusRow = {
  package_ordinal: number;
  work_area_name: string | null;
  work_area_number: string | null;
  psa_csa: string | null;
  service_provider: string | null;
  vision_label_raw: string | null;
  vision_label: string | null;
  vision_label_at_local: string | null;
  tracking_id: string;
  destination_address: string | null;
  vehicle_number: string | null;
  vsa_status_code: string | null;
  star_status_code: string | null;
  star_scan_at_local: string | null;
};

export type DswPackageStatusWorkbook = {
  service_date: string;
  terminal_identity: string | null;
  generated_at: string | null;
  sheet_name: string;
  header_row_number: number;
  rows: DswPackageStatusRow[];
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function optionalText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function yyyyMmDd(value: string) {
  const match = value.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function localTimestamp(value: unknown) {
  const raw = text(value);
  if (!raw) return null;

  const iso = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
  );
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6]}`;
  }

  const us = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!us) return null;
  return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}T${us[4].padStart(2, "0")}:${us[5]}:${us[6] ?? "00"}`;
}

function splitVisionLabel(value: unknown) {
  const raw = optionalText(value);
  if (!raw) {
    return { raw: null, label: null, observedAtLocal: null };
  }
  const match = raw.match(
    /^(.*?)\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/
  );
  return {
    raw,
    label: match ? optionalText(match[1]) : raw,
    observedAtLocal: match ? localTimestamp(match[2]) : null,
  };
}

function parseGeneratedAt(value: string) {
  const match = value.match(
    /Generated\s*-\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC/i
  );
  return match ? `${match[1]}T${match[2]}Z` : null;
}

export function parseDswPackageStatusWorkbook(
  buffer: Buffer
): DswPackageStatusWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Package status workbook has no sheets.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[sheetName],
    { header: 1, blankrows: true, defval: "", raw: false }
  );
  const headerIndex = rows.findIndex((row) =>
    DSW_PACKAGE_STATUS_HEADERS.every(
      (header, index) => text(row[index]) === header
    )
  );
  if (headerIndex < 0) {
    throw new Error("All Status Code Packages headers were not detected.");
  }

  const metadataText = rows
    .slice(0, headerIndex)
    .flat()
    .map(text)
    .filter(Boolean)
    .join(" | ");
  if (!/Package Level Detail Table/i.test(metadataText)) {
    throw new Error("Workbook is not a Package Level Detail Table.");
  }

  const serviceDate = yyyyMmDd(metadataText);
  if (!serviceDate) {
    throw new Error("Package status service date was not detected.");
  }
  const terminalMatch = metadataText.match(/FedEx\s*-\s*([^|]+?)\s*-\s*20\d{6}/i);
  const parsedRows: DswPackageStatusRow[] = [];

  for (const source of rows.slice(headerIndex + 1)) {
    const trackingId = text(source[6]).replace(/\s+/g, "");
    if (!trackingId) continue;

    const ordinal = Number.parseInt(text(source[0]).replace(/,/g, ""), 10);
    if (!Number.isFinite(ordinal)) {
      throw new Error("Package detail row has no valid package ordinal.");
    }

    const vision = splitVisionLabel(source[5]);
    parsedRows.push({
      package_ordinal: ordinal,
      work_area_name: optionalText(source[1]),
      work_area_number: optionalText(source[2]),
      psa_csa: optionalText(source[3]),
      service_provider: optionalText(source[4]),
      vision_label_raw: vision.raw,
      vision_label: vision.label,
      vision_label_at_local: vision.observedAtLocal,
      tracking_id: trackingId,
      destination_address: optionalText(source[7]),
      vehicle_number: optionalText(source[8]),
      vsa_status_code: optionalText(source[9]),
      star_status_code: optionalText(source[10]),
      star_scan_at_local: localTimestamp(source[11]),
    });
  }

  const uniqueTrackingIds = new Set(parsedRows.map((row) => row.tracking_id));
  if (uniqueTrackingIds.size !== parsedRows.length) {
    throw new Error("Package detail workbook contains duplicate tracking IDs.");
  }

  return {
    service_date: serviceDate,
    terminal_identity: terminalMatch ? text(terminalMatch[1]) : null,
    generated_at: parseGeneratedAt(metadataText),
    sheet_name: sheetName,
    header_row_number: headerIndex + 1,
    rows: parsedRows,
  };
}
