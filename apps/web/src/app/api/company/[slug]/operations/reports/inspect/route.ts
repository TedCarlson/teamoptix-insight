import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return cellText(value).toLowerCase().replace(/\s+/g, " ");
}

function rowHasHeaders(row: unknown[], headers: string[]) {
  const normalized = new Set(row.map(normalizeHeader).filter(Boolean));
  return headers.every((header) => normalized.has(header.toLowerCase()));
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

function inspectDsw(rows: unknown[][]) {
  const metaLine = rows.flat().map(cellText).find((cell) =>
    cell.startsWith("FedEx - ")
  );

  const generatedLine = rows.flat().map(cellText).find((cell) =>
    cell.startsWith("Generated - ")
  );

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
    confidence: headerIndex >= 0 ? 0.98 : 0.65,
    detected_header_row: headerIndex >= 0 ? headerIndex + 1 : null,
    service_date: match?.[3] ?? null,
    terminal_code: match?.[1] ?? null,
    contract_filter: match?.[2] ?? null,
    generated_at_text: generatedLine?.replace("Generated - ", "") ?? null,
    route_row_count: routeRows,
    participant_row_count: participantRows,
    summary_row_count: summaryRows,
  };
}

function inspectDro(rows: unknown[][]) {
  const headerIndex = findHeaderRow(rows, [
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

function inspectFcc(rows: unknown[][]) {
  const headerIndex = findHeaderRow(rows, [
    "Station",
    "SA#",
    "WA#",
    "Driver Name",
    "User Type",
    "Last Delivery Time",
    "Last Pickup Time",
    "1st Stop Close",
    "Deliveries Complete",
    "Pickup Complete",
    "Last Transmission Time",
  ]);

  return {
    report_family_key: "FCC",
    report_shape_key: "FCC_ROUTE_HEALTH",
    report_family_label: "FCC Route Health",
    confidence: headerIndex >= 0 ? 1 : 0.4,
    detected_header_row: headerIndex >= 0 ? headerIndex + 1 : null,
    route_row_count: countRowsAfterHeader(rows, headerIndex),
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

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: true,
      defval: "",
    });

    const dsw = inspectDsw(rows);
    const dro = inspectDro(rows);
    const fcc = inspectFcc(rows);

    const best = [dsw, dro, fcc].sort((a, b) => b.confidence - a.confidence)[0];

    return NextResponse.json({
      ok: true,
      file_name: file.name,
      file_size: file.size,
      sheet_name: firstSheetName,
      sheet_count: workbook.SheetNames.length,
      detected: best,
      candidates: [dsw, dro, fcc],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inspection failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
