import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type InspectResult = {
  report_family_key: "DSW" | "DRO" | "FCC" | "UNKNOWN";
  report_shape_key: string;
  report_family_label: string;
  confidence: number;
  detected_header_row: number | null;
  service_date?: string | null;
  terminal_code?: string | null;
  contract_filter?: string | null;
  generated_at_text?: string | null;
  service_area?: string | null;
  display_work_area?: string | null;
  header_sheet_name?: string | null;
  detail_sheet_name?: string | null;
  route_row_count: number;
  participant_row_count: number;
  summary_row_count: number;
};

const FCC_DETAIL_HEADERS = [
  "Station",
  "SA#",
  "WA#",
  "Driver Name",
  "User Type",
  "Last Delivery Time",
  "Last Delivery Address",
  "Last Pickup Time",
  "Last Pickup Address",
  "1st Stop Close",
  "Deliveries Complete",
  "Pickup Complete",
  "Final Stop Time",
  "Last Transmission Time",
];

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return cellText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+#/g, "#")
    .trim();
}

function rowHasHeaders(row: unknown[], headers: string[]) {
  const normalized = new Set(row.map(normalizeHeader).filter(Boolean));
  return headers.every((header) => normalized.has(normalizeHeader(header)));
}

function findHeaderRow(rows: unknown[][], headers: string[]) {
  return rows.findIndex((row) => rowHasHeaders(row, headers));
}

function countRowsAfterHeader(rows: unknown[][], headerIndex: number) {
  if (headerIndex < 0) return 0;

  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cellText(cell))).length;
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
  });
}

function parseUsDateToIso(value: unknown) {
  const text = cellText(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;

  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const year = match[3];

  return `${year}-${month}-${day}`;
}

function headerValue(rows: unknown[][], labels: string[]) {
  const targets = labels.map((label) => normalizeHeader(label));

  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const current = normalizeHeader(row[index]);
      if (!targets.includes(current)) continue;

      for (let next = index + 1; next < row.length; next += 1) {
        const value = cellText(row[next]);
        if (value) return value;
      }
    }
  }

  return null;
}

function inspectDsw(rows: unknown[][]): InspectResult {
  const metaLine = cellText(rows[0]?.[0]);
  const reportTitle = cellText(rows[0]?.[5]);

  const generatedLine = cellText(rows[0]?.[10]);

  const match = metaLine?.match(
    /^FedEx - (.+?) - Contract: (.+?) - (\d{1,2}\/\d{1,2}\/\d{4})$/
  );

  const headerIndex = findHeaderRow(rows, [
    "Svc Area #",
    "WA Name",
    "Veh #",
    "Driver Name",
    "WA#",
    "VScan Pkgs",
    "Del Stps",
    "Act Del Stps",
    "Act Del Pkgs",
  ]);

  let routeRows = 0;
  let participantRows = 0;
  let summaryRows = 0;

  if (headerIndex >= 0) {
    for (const row of rows.slice(headerIndex + 1)) {
      const first = cellText(row[0]);
      const waName = cellText(row[1]);
      const vehicle = cellText(row[2]);
      const driver = cellText(row[3]);

      if (!row.some((cell) => cellText(cell))) continue;
      if (first.startsWith("Access is restricted")) break;
      if (first.startsWith("Due to stop rate")) break;

      if (first.includes("Contract") && first.includes("Total")) {
        summaryRows += 1;
        continue;
      }

      if (first === "Colocation Total") {
        summaryRows += 1;
        continue;
      }

      if (driver && first && waName) {
        routeRows += 1;
        continue;
      }

      if (driver && vehicle && !waName) {
        participantRows += 1;
      }
    }
  }

  return {
    report_family_key: "DSW",
    report_shape_key: "DSW_DAILY_SERVICE_WORKSHEET",
    report_family_label: "Daily Service Worksheet",
    confidence: headerIndex >= 0 && reportTitle.toLowerCase() === "daily service worksheet" ? 0.98 : 0,
    detected_header_row: headerIndex >= 0 ? headerIndex + 1 : null,
    service_date: match?.[3] ? parseUsDateToIso(match[3]) : null,
    terminal_code: match?.[1] ?? null,
    contract_filter: match?.[2] ?? null,
    generated_at_text: generatedLine.startsWith("Generated - ") ? generatedLine.replace("Generated - ", "") : null,
    route_row_count: routeRows,
    participant_row_count: participantRows,
    summary_row_count: summaryRows,
  };
}

function inspectDro(rows: unknown[][]): InspectResult {
  const headerIndex = findHeaderRow(rows, [
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
  ]);

  return {
    report_family_key: "DRO",
    report_shape_key: "DRO_ROUTE_SUMMARY",
    report_family_label: "DRO Route Summary",
    confidence: headerIndex >= 0 ? 1 : 0.4,
    detected_header_row: headerIndex >= 0 ? headerIndex + 1 : null,
    route_row_count: countRowsAfterHeader(rows, headerIndex),
    participant_row_count: 0,
    summary_row_count: 0,
  };
}

function inspectFcc(workbook: XLSX.WorkBook): InspectResult {
  const headerSheetName =
    workbook.SheetNames.find((name) => normalizeHeader(name) === "header") ?? null;
  const detailSheetName =
    workbook.SheetNames.find((name) => normalizeHeader(name) === "work area details") ?? null;

  if (!headerSheetName || !detailSheetName) {
    return {
      report_family_key: "FCC",
      report_shape_key: "FCC_SERVICE_AREA_STATUS",
      report_family_label: "FCC Service Area Status",
      confidence: 0,
      detected_header_row: null,
      route_row_count: 0,
      participant_row_count: 0,
      summary_row_count: 0,
    };
  }

  const headerRows = sheetRows(workbook, headerSheetName);
  const detailRows = sheetRows(workbook, detailSheetName);
  const detailHeaderIndex = findHeaderRow(detailRows, FCC_DETAIL_HEADERS);

  const reportName = headerValue(headerRows, ["Page"]);
  const serviceDate = parseUsDateToIso(headerValue(headerRows, ["Date"]));
  const serviceArea = headerValue(headerRows, ["SA#", "Service Area", "SA"]);
  const displayWorkArea = headerValue(headerRows, ["Display Work Area"]);
  const exportGenerated = headerValue(headerRows, ["Export Generated"]);

  const headerLooksRight = normalizeHeader(reportName) === "service area status";

  return {
    report_family_key: "FCC",
    report_shape_key: "FCC_SERVICE_AREA_STATUS",
    report_family_label: "FCC Service Area Status",
    confidence: headerLooksRight && detailHeaderIndex >= 0 ? 1 : detailHeaderIndex >= 0 ? 0.75 : 0,
    detected_header_row: detailHeaderIndex >= 0 ? detailHeaderIndex + 1 : null,
    service_date: serviceDate,
    service_area: serviceArea,
    display_work_area: displayWorkArea,
    generated_at_text: exportGenerated,
    header_sheet_name: headerSheetName,
    detail_sheet_name: detailSheetName,
    route_row_count: countRowsAfterHeader(detailRows, detailHeaderIndex),
    participant_row_count: 0,
    summary_row_count: 0,
  };
}

export async function POST(req: NextRequest, _context: RouteContext) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return NextResponse.json({ error: "Workbook has no sheets." }, { status: 400 });
    }

    const firstSheetRows = sheetRows(workbook, firstSheetName);

    const dsw = inspectDsw(firstSheetRows);
    const dro = inspectDro(firstSheetRows);
    const fcc = inspectFcc(workbook);
    const unknown: InspectResult = {
      report_family_key: "UNKNOWN",
      report_shape_key: "UNKNOWN",
      report_family_label: "Unknown report",
      confidence: 0,
      detected_header_row: null,
      route_row_count: 0,
      participant_row_count: 0,
      summary_row_count: 0,
    };

    const best = [dsw, dro, fcc, unknown].sort((a, b) => b.confidence - a.confidence)[0];

    return NextResponse.json({
      ok: true,
      file_name: file.name,
      file_size: file.size,
      sheet_name: best.detail_sheet_name ?? firstSheetName,
      sheet_count: workbook.SheetNames.length,
      detected: best,
      candidates: [dsw, dro, fcc],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inspection failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
