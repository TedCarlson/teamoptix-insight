import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import {
  DRO_AM_HEADERS,
  detectDroPackageDetailWorkbook,
  droCellText,
  normalizeDroRow,
  normalizeDroWaNumber,
  parseDroRows,
} from "./dro.parser";

type ArtifactRow = {
  service_date: string | null;
  size_bytes: number | null;
  runner_artifact_json?: Record<string, unknown> | null;
};

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
  const serviceDate = droCellText(artifact.service_date);
  if (!serviceDate) {
    throw new Error("DRO Package Detail artifact is missing its service date.");
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const detected = detectDroPackageDetailWorkbook(workbook);
  if (!detected) {
    throw new Error("DRO Package Detail signature headers were not detected.");
  }
  if (detected.frame !== "AM") {
    throw new Error("Automated DRO Package Detail ingestion requires the AM report.");
  }
  const { sheetName, rows, headerIndex } = detected;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();
  if (companyError || !company) {
    throw new Error(companyError?.message ?? "Company not found.");
  }

  const { data: ownershipRows, error: ownershipError } = await supabase.rpc(
    "get_active_company_contract_config",
    {
      p_company_slug: slug,
      p_service_date: serviceDate,
    }
  );
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

  const parsedRows = parseDroRows(rows, headerIndex).filter(
    ({ raw }) => droCellText(raw["WA NAME"]) || droCellText(raw["WA #"])
  );
  const stagedRows = parsedRows.map(({ raw, source_row_index }) => {
    const dro = normalizeDroRow(raw, "AM");
    const routeMatch =
      routeRows?.find(
        (row: any) =>
          normalizeDroWaNumber(row.current_wa_num) ===
          normalizeDroWaNumber(dro.wa_number)
      ) ??
      routeRows?.find(
        (row: any) =>
          droCellText(row.route_name).toLowerCase() ===
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
          ? normalizeDroWaNumber(routeMatch.current_wa_num) ===
            normalizeDroWaNumber(dro.wa_number)
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
