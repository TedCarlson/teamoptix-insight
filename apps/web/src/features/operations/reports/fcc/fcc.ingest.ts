import * as XLSX from "xlsx";
import { createHash } from "crypto";

type ParsedRow = Record<string, unknown>;

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
  return cellText(value).toLowerCase().replace(/\s+/g, " ").replace(/\s+#/g, "#").trim();
}

function normalizeWaNumber(value: unknown) {
  const valueText = cellText(value);
  const trimmed = valueText.replace(/^0+/, "");
  return trimmed || valueText;
}

function rowHasHeaders(row: unknown[], headers: string[]) {
  const normalized = new Set(row.map(normalizeHeader).filter(Boolean));
  return headers.every((header) => normalized.has(normalizeHeader(header)));
}

function findHeaderRow(rows: unknown[][], headers: string[]) {
  return rows.findIndex((row) => rowHasHeaders(row, headers));
}

function toBool(value: unknown) {
  const valueText = cellText(value).toLowerCase();
  if (!valueText) return null;
  if (["y", "yes", "true", "1", "complete", "completed"].includes(valueText)) return true;
  if (["n", "no", "false", "0", "incomplete"].includes(valueText)) return false;
  return null;
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
  const valueText = cellText(value);
  const match = valueText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;

  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function headerValue(rows: unknown[][], labels: string[]) {
  const targets = labels.map((label) => normalizeHeader(label));

  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (!targets.includes(normalizeHeader(row[index]))) continue;

      for (let next = index + 1; next < row.length; next += 1) {
        const value = cellText(row[next]);
        if (value) return value;
      }
    }
  }

  return null;
}

function objectRows(rows: unknown[][], headerIndex: number) {
  const headers = (rows[headerIndex] ?? []).map(cellText);

  return rows
    .slice(headerIndex + 1)
    .map((row, offset) => {
      const raw: ParsedRow = {};
      headers.forEach((header, index) => {
        if (header) raw[header] = row[index] ?? "";
      });
      return { source_row_index: headerIndex + 2 + offset, raw };
    })
    .filter(({ raw }) => Object.values(raw).some((value) => cellText(value)));
}

function normalizeFcc(raw: ParsedRow, headerMeta: Record<string, unknown>) {
  return {
    station: cellText(raw["Station"]),
    service_area: cellText(raw["SA#"]) || cellText(headerMeta.service_area),
    wa_number: cellText(raw["WA#"]),
    wa_number_normalized: normalizeWaNumber(raw["WA#"]),
    driver_name: cellText(raw["Driver Name"]),
    user_type: cellText(raw["User Type"]),
    last_delivery_time: cellText(raw["Last Delivery Time"]) || null,
    last_delivery_address: cellText(raw["Last Delivery Address"]) || null,
    last_pickup_time: cellText(raw["Last Pickup Time"]) || null,
    last_pickup_address: cellText(raw["Last Pickup Address"]) || null,
    first_stop_close: cellText(raw["1st Stop Close"]) || null,
    deliveries_complete: toBool(raw["Deliveries Complete"]),
    pickup_complete: toBool(raw["Pickup Complete"]),
    final_stop_time: cellText(raw["Final Stop Time"]) || null,
    last_transmission_time: cellText(raw["Last Transmission Time"]) || null,
    source_report_name: headerMeta.source_report_name,
    report_date_text: headerMeta.report_date_text,
    export_generated_text: headerMeta.export_generated_text,
    display_work_area: headerMeta.display_work_area,
  };
}

export async function ingestFccWorkbook(params: {
  supabase: any;
  slug: string;
  buffer: Buffer;
  filename: string;
  fileSize: number;
  serviceDate?: string;
  uploadedByAuthUserId?: string | null;
  uploadedByProfileId?: string | null;
}) {
  const { supabase, slug, buffer, filename, fileSize, serviceDate } = params;
  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const fccHeaderSheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "header") ?? null;
  const fccDetailSheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "work area details") ?? null;

  if (!fccHeaderSheetName || !fccDetailSheetName) {
    throw new Error("FCC Header and Work Area Details sheets were not detected.");
  }

  const headerRows = sheetRows(workbook, fccHeaderSheetName);
  const detailRows = sheetRows(workbook, fccDetailSheetName);
  const detailHeaderIndex = findHeaderRow(detailRows, FCC_DETAIL_HEADERS);

  if (detailHeaderIndex < 0) throw new Error("FCC Work Area Details headers were not detected.");

  const sourceReportName = headerValue(headerRows, ["Page"]);
  const reportDateText = headerValue(headerRows, ["Date"]);
  const headerServiceDate = parseUsDateToIso(reportDateText);
  const warehouseServiceDate = headerServiceDate || serviceDate;
  if (!warehouseServiceDate) throw new Error("FCC service date was not found in artifact context or Header tab.");
  const headerServiceArea = headerValue(headerRows, ["SA#", "Service Area", "SA"]);
  const displayWorkArea = headerValue(headerRows, ["Display Work Area"]);
  const exportGeneratedText = headerValue(headerRows, ["Export Generated"]);

  if (normalizeHeader(sourceReportName) !== "service area status") {
    throw new Error("FCC Header sheet did not identify Service Area Status.");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) throw new Error("Company not found.");

  const { data: ownershipRows, error: ownershipError } = await supabase.rpc(
    "get_active_company_contract_config",
    {
      p_company_slug: slug,
      p_service_date: warehouseServiceDate,
    }
  );

  if (ownershipError) throw new Error(ownershipError.message);

  const ownership = ownershipRows?.[0] ?? null;
  if (!ownership) throw new Error("No active contract/service-area configuration found for this report date.");

  if (headerServiceArea && ownership.service_area && headerServiceArea !== ownership.service_area) {
    throw new Error(`FCC service area ${headerServiceArea} does not match configured service area ${ownership.service_area}.`);
  }

  const { data: routeRows, error: routeError } = await supabase
    .from("route_baseline")
    .select("id, route_name, current_wa_num, route_location, route_type, terminal_id")
    .eq("company_id", company.id)
    .eq("is_active", true)
    .lte("effective_start", warehouseServiceDate)
    .or(`effective_end.is.null,effective_end.gte.${warehouseServiceDate}`);

  if (routeError) throw new Error(routeError.message);

  const headerMeta = {
    source_report_name: sourceReportName,
    report_date_text: reportDateText,
    service_area: headerServiceArea,
    display_work_area: displayWorkArea,
    export_generated_text: exportGeneratedText,
    header_sheet_name: fccHeaderSheetName,
    detail_sheet_name: fccDetailSheetName,
  };

  const parsedRows = objectRows(detailRows, detailHeaderIndex).filter(
    ({ raw }) => cellText(raw["WA#"]) || cellText(raw["Driver Name"])
  );

  const stagedRows = parsedRows.map(({ raw, source_row_index }) => {
    const fcc = normalizeFcc(raw, headerMeta);
    const routeMatch =
      routeRows?.find((row: any) => normalizeWaNumber(row.current_wa_num) === fcc.wa_number_normalized) ?? null;

    return {
      sheet_name: fccDetailSheetName,
      source_row_index,
      row_kind: "ROUTE",
      raw_row_json: raw,
      normalized_row_json: {
        ...fcc,
        contract_number: ownership.contract_number,
        terminal_identity: ownership.terminal_identity,
        configured_service_area: ownership.service_area,
        route_baseline_id: routeMatch?.id ?? null,
        route_match_method: routeMatch ? "WA_NUMBER" : "NONE",
      },
      source_route_key: fcc.wa_number || null,
      source_wa_number: fcc.wa_number || null,
      source_driver_name: fcc.driver_name || null,
      source_dswid: null,
    };
  });

  const matchedCount = stagedRows.filter(
    (row) => row.normalized_row_json.route_match_method !== "NONE"
  ).length;

  const { data: rpcResult, error: rpcError } = await supabase.rpc("stage_operations_fcc_report", {
    p_company_id: company.id,
    p_service_date: warehouseServiceDate,
    p_source_filename: filename,
    p_source_hash: sourceHash,
    p_detected_sheet_name: fccDetailSheetName,
    p_detected_header_row: detailHeaderIndex + 1,
    p_detected_headers: FCC_DETAIL_HEADERS,
    p_row_count: parsedRows.length,
    p_route_row_count: stagedRows.length,
    p_participant_row_count: 0,
    p_skipped_row_count: parsedRows.length - stagedRows.length,
    p_uploaded_by_profile_id: params.uploadedByProfileId ?? null,
    p_metadata_json: {
      file_size: fileSize,
      sheet_count: workbook.SheetNames.length,
      uploaded_by_auth_user_id: params.uploadedByAuthUserId ?? null,
      ownership_context: {
        config_id: ownership.id,
        contract_number: ownership.contract_number,
        terminal_identity: ownership.terminal_identity,
        service_area: ownership.service_area,
      },
      collection_context: {
        service_date: warehouseServiceDate,
        service_date_used: warehouseServiceDate,
        service_date_source: headerServiceDate ? "FCC_HEADER" : "ARTIFACT_CONTEXT",
      },
      fcc_header: headerMeta,
      route_match: {
        matched: matchedCount,
        unmatched: stagedRows.length - matchedCount,
      },
    },
    p_rows: stagedRows,
  });

  if (rpcError) throw new Error(rpcError.message);

  return {
    ok: true,
    batch_id: rpcResult?.batch_id ?? null,
    report_family_key: "FCC",
    report_shape_key: "FCC_SERVICE_AREA_STATUS",
    service_date: warehouseServiceDate,
    inserted_row_count: stagedRows.length,
    matched_route_count: matchedCount,
    unmatched_route_count: stagedRows.length - matchedCount,
    ownership_context: {
      contract_number: ownership.contract_number,
      terminal_identity: ownership.terminal_identity,
      service_area: ownership.service_area,
    },
    collection_context: {
      service_date: warehouseServiceDate,
      service_date_used: warehouseServiceDate,
      service_date_source: headerServiceDate ? "FCC_HEADER" : "ARTIFACT_CONTEXT",
    },
    fcc_header: headerMeta,
  };
}
