import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

type ArtifactRow = {
  service_date: string | null;
  size_bytes: number | null;
  runner_artifact_json?: Record<string, unknown> | null;
};

type ParsedRow = Record<string, unknown>;

const DRO_AM_HEADERS = [
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

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return cellText(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+#/g, "#")
    .trim();
}

function normalizeWaNumber(value: unknown) {
  const text = cellText(value);
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
  const text = cellText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown) {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
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
    .filter(({ raw }) =>
      Object.values(raw).some((value) => Boolean(cellText(value)))
    );
}

function normalizeDroAm(raw: ParsedRow) {
  return {
    wa_name: cellText(raw["WA NAME"]),
    wa_number: cellText(raw["WA #"]),
    route_type: cellText(raw["ROUTE TYPE"]),
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

export async function ingestDroPackageDetailWorkbook(params: {
  supabase: any;
  slug: string;
  buffer: Buffer;
  filename: string;
  artifact: ArtifactRow;
  uploadedByProfileId?: string | null;
}) {
  const {
    supabase,
    slug,
    buffer,
    filename,
    artifact,
    uploadedByProfileId = null,
  } = params;
  const serviceDate = cellText(artifact.service_date);
  if (!serviceDate) {
    throw new Error("DRO Package Detail artifact is missing its service date.");
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("DRO Package Detail workbook has no sheets.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[sheetName],
    { header: 1, blankrows: true, defval: "" }
  );
  const headerIndex = findHeaderRow(rows, DRO_AM_HEADERS);
  if (headerIndex < 0) {
    throw new Error("DRO Package Detail signature headers were not detected.");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();
  if (companyError || !company) {
    throw new Error(companyError?.message ?? "Company not found.");
  }

  const { data: ownershipRows, error: ownershipError } = await supabase
    .from("company_contract_config")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "ACTIVE")
    .lte("effective_start_date", serviceDate)
    .or(`effective_end_date.is.null,effective_end_date.gte.${serviceDate}`)
    .order("effective_start_date", { ascending: false });
  if (ownershipError) throw new Error(ownershipError.message);

  const ownership = ownershipRows?.[0] ?? null;
  if (!ownership) {
    throw new Error(
      "No active contract/service-area configuration found for this DRO report date."
    );
  }

  const { data: routeRows, error: routeError } = await supabase
    .from("route_baseline")
    .select("id, route_name, current_wa_num")
    .eq("company_id", company.id)
    .eq("is_active", true)
    .lte("effective_start", serviceDate)
    .or(`effective_end.is.null,effective_end.gte.${serviceDate}`);
  if (routeError) throw new Error(routeError.message);

  const parsedRows = objectRows(rows, headerIndex).filter(
    ({ raw }) => cellText(raw["WA NAME"]) || cellText(raw["WA #"])
  );
  const stagedRows = parsedRows.map(({ raw, source_row_index }) => {
    const dro = normalizeDroAm(raw);
    const routeMatch =
      routeRows?.find(
        (row: any) =>
          normalizeWaNumber(row.current_wa_num) ===
          normalizeWaNumber(dro.wa_number)
      ) ??
      routeRows?.find(
        (row: any) =>
          cellText(row.route_name).toLowerCase() ===
          dro.wa_name.toLowerCase()
      ) ??
      null;

    return {
      sheet_name: sheetName,
      source_row_index,
      row_kind: "ROUTE",
      raw_row_json: raw,
      normalized_row_json: {
        ...dro,
        contract_number: ownership.contract_number,
        terminal_identity: ownership.terminal_identity,
        service_area: ownership.service_area,
        route_baseline_id: routeMatch?.id ?? null,
        route_match_method: routeMatch
          ? normalizeWaNumber(routeMatch.current_wa_num) ===
            normalizeWaNumber(dro.wa_number)
            ? "WA_NUMBER"
            : "ROUTE_NAME"
          : "NONE",
      },
      source_route_key: dro.wa_name || dro.wa_number || null,
      source_wa_number: dro.wa_number || null,
    };
  });
  const matchedCount = stagedRows.filter(
    (row) => row.normalized_row_json.route_match_method !== "NONE"
  ).length;
  const sourceHash = createHash("sha256").update(buffer).digest("hex");

  const { data, error } = await supabase.rpc("stage_operations_dro_report", {
    p_company_id: company.id,
    p_service_date: serviceDate,
    p_report_frame: "AM",
    p_source_filename: filename,
    p_source_hash: sourceHash,
    p_detected_sheet_name: sheetName,
    p_detected_header_row: headerIndex + 1,
    p_detected_headers: DRO_AM_HEADERS,
    p_row_count: parsedRows.length,
    p_route_row_count: stagedRows.length,
    p_participant_row_count: 0,
    p_skipped_row_count: parsedRows.length - stagedRows.length,
    p_uploaded_by_profile_id: uploadedByProfileId,
    p_metadata_json: {
      file_size: artifact.size_bytes ?? buffer.length,
      sheet_count: workbook.SheetNames.length,
      source: "continuous_runner",
      artifact_key:
        artifact.runner_artifact_json?.artifact_key ?? "DRO_PACKAGE_DETAIL",
      ownership_context: {
        config_id: ownership.id,
        contract_number: ownership.contract_number,
        terminal_identity: ownership.terminal_identity,
        service_area: ownership.service_area,
      },
      route_match: {
        matched: matchedCount,
        unmatched: stagedRows.length - matchedCount,
      },
    },
    p_rows: stagedRows,
  });
  if (error) throw new Error(error.message);

  return {
    ok: true,
    batch_id: data?.batch_id ?? null,
    report_family_key: "DRO",
    report_shape_key: "DRO_AM_ROUTE_READINESS",
    report_frame: "AM",
    snapshot_kind: "IN_DAY",
    service_date: serviceDate,
    inserted_row_count: stagedRows.length,
    matched_route_count: matchedCount,
    unmatched_route_count: stagedRows.length - matchedCount,
  };
}
