import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { DSW_HEADERS } from "@/features/operations/reports/dsw/dsw.headers";
import {
  cellText,
  findHeaderRow,
  objectRows,
  extractMeta,
} from "@/features/operations/reports/dsw/dsw.parse";
import {
  payrollWeekEndFriday,
  payrollWeekStartFor,
} from "@/features/operations/reports/dsw/dsw.payrollWeek";
import type { DswRouteBaselineRow } from "@/features/operations/reports/dsw/dsw.routeMatch";
import {
  excelDateToIso,
  deriveDswSnapshotKind,
} from "@/features/operations/reports/dsw/dsw.metadata";
import { classifyDswRows } from "@/features/operations/reports/dsw/dsw.classify";
import {
  buildDswStagedRows,
  buildDswStagedSummaryRows,
  countMatchedDswRoutes,
} from "@/features/operations/reports/dsw/dsw.stage";
import {
  buildClassificationSummary,
  buildCandidatePreview,
} from "@/features/operations/reports/dsw/dsw.inspect";

type SupabaseLike = any;

export async function ingestDswWorkbook(params: {
  supabase: SupabaseLike;
  slug: string;
  buffer: Buffer;
  filename: string;
  fileSize: number;
  uploadedByAuthUserId?: string | null;
  uploadedByProfileId?: string | null;
  debugCandidates?: boolean;
  artifactLineage?: Record<string, unknown>;
}) {
  const {
    supabase,
    slug,
    buffer,
    filename,
    fileSize,
    uploadedByAuthUserId = null,
    uploadedByProfileId = null,
    debugCandidates = false,
    artifactLineage,
  } = params;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    throw new Error("Company not found.");
  }

  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    defval: "",
  });

  const meta = extractMeta(rows);
  if (meta.report_title?.toLowerCase() !== "daily service worksheet") {
    throw new Error("F1 does not identify this file as a Daily Service Worksheet.");
  }
  const headerServiceDate = meta.service_date_text
    ? excelDateToIso(meta.service_date_text)
    : "";

  if (!headerServiceDate) {
    throw new Error("DSW report date was not detected in the file header.");
  }

  const serviceDate = headerServiceDate;
  const snapshotKind = deriveDswSnapshotKind(serviceDate);

  if (snapshotKind === "FUTURE") {
    throw new Error("Future-dated DSW uploads are not supported.");
  }

  const headerIndex = findHeaderRow(rows, DSW_HEADERS);
  if (headerIndex < 0) {
    throw new Error("DSW signature headers were not detected.");
  }

  const { data: routes, error: routeError } = await supabase
    .from("route_baseline")
    .select("id, route_name, current_wa_num, effective_start, effective_end")
    .eq("company_id", company.id);

  if (routeError) {
    throw new Error(routeError.message);
  }

  const classifiedRows = classifyDswRows(objectRows(rows, headerIndex));
  const parsedRows = classifiedRows.filter((row) => row.row_kind === "ROUTE");
  const summaryRows = classifiedRows.filter((row) => row.row_kind === "SUMMARY");

  const stagedRows = buildDswStagedRows({
    rows: classifiedRows.filter(
      (row) =>
        row.row_kind === "ROUTE" ||
        row.row_kind === "ROUTE_CANDIDATE" ||
        row.row_kind === "ROUTE_BREAKOUT"
    ),
    sheetName,
    routes: (routes ?? []) as DswRouteBaselineRow[],
    serviceDate,
    meta,
  });

  const stagedSummaryRows = buildDswStagedSummaryRows({
    rows: summaryRows,
    serviceDate,
    meta,
  });

  const matchedCount = countMatchedDswRoutes(stagedRows);
  const rowClassification = buildClassificationSummary(classifiedRows);
  const candidatePreview = debugCandidates
    ? buildCandidatePreview(classifiedRows)
    : undefined;

  const uploadMetadata = {
    file_size: fileSize,
    sheet_count: workbook.SheetNames.length,
    uploaded_by_auth_user_id: uploadedByAuthUserId,
    terminal_identity: meta.terminal_identity,
    contract_filter: meta.contract_filter,
    generated_at_text: meta.generated_at_text,
    service_date_source: "DSW_FILE_HEADER",
    detected_service_date: serviceDate,
    derived_snapshot_kind: snapshotKind,
    detected_sheet_name: sheetName,
    detected_header_row: headerIndex + 1,
    route_match: {
      matched: matchedCount,
      unmatched: stagedRows.length - matchedCount,
    },
    summary_row_count: stagedSummaryRows.length,
    row_classification: rowClassification,
    ...(artifactLineage ? { artifact_lineage: artifactLineage } : {}),
  };

  if (snapshotKind === "FINAL") {
    const { data: finalResult, error: finalError } = await supabase.rpc(
      "import_operations_dsw_finalized_day",
      {
        p_company_id: company.id,
        p_service_date: serviceDate,
        p_source_filename: filename,
        p_source_hash: sourceHash,
        p_detected_headers: DSW_HEADERS,
        p_row_count: parsedRows.length,
        p_uploaded_by_profile_id: uploadedByProfileId,
        p_metadata_json: uploadMetadata,
        p_rows: stagedRows,
        p_summary_rows: stagedSummaryRows,
      }
    );

    if (finalError) {
      throw new Error(finalError.message);
    }

    const payrollWeekStart = payrollWeekStartFor(serviceDate);
    const payrollWeekEnd = payrollWeekEndFriday(serviceDate);

    const { data: payrollRebuildResult, error: payrollRebuildError } =
      await supabase.rpc("rebuild_payroll_activity_fact", {
        p_company_id: company.id,
        p_start_date: payrollWeekStart,
        p_end_date: payrollWeekEnd,
      });

    if (payrollRebuildError) {
      throw new Error(payrollRebuildError.message);
    }

    return {
      ok: true,
      batch_id: typeof finalResult?.batch_id === "string" ? finalResult.batch_id : null,
      report_family_key: "DSW",
      report_shape_key: "DSW_FINALIZED_DAY",
      snapshot_kind: "FINAL",
      service_date: serviceDate,
      inserted_row_count: finalResult?.inserted_row_count ?? stagedRows.length,
      inserted_summary_row_count: finalResult?.inserted_summary_row_count ?? stagedSummaryRows.length,
      deleted_batch_count: finalResult?.deleted_batch_count ?? 0,
      matched_route_count: matchedCount,
      unmatched_route_count: stagedRows.length - matchedCount,
      payroll_rebuild: payrollRebuildResult ?? null,
      row_classification: rowClassification,
      candidate_preview: candidatePreview,
    };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "stage_operations_dsw_report",
    {
      p_company_id: company.id,
      p_service_date: serviceDate,
      p_source_filename: filename,
      p_source_hash: sourceHash,
      p_detected_sheet_name: sheetName,
      p_detected_header_row: headerIndex + 1,
      p_detected_headers: DSW_HEADERS,
      p_row_count: parsedRows.length,
      p_route_row_count: stagedRows.length,
      p_participant_row_count: 0,
      p_skipped_row_count: parsedRows.length - stagedRows.length,
      p_uploaded_by_profile_id: uploadedByProfileId,
      p_metadata_json: uploadMetadata,
      p_rows: stagedRows,
    }
  );

  if (rpcError) {
    throw new Error(rpcError.message);
  }

  const batchId = typeof rpcResult?.batch_id === "string" ? rpcResult.batch_id : null;

  if (batchId && stagedSummaryRows.length > 0) {
    const { error: summaryError } = await supabase.rpc(
      "stage_operations_dsw_summary_rows",
      {
        p_batch_id: batchId,
        p_company_id: company.id,
        p_rows: stagedSummaryRows,
      }
    );

    if (summaryError) {
      throw new Error(summaryError.message);
    }
  }

  if (batchId) {
    const { error: supersedeError } = await supabase.rpc(
      "supersede_operations_report_batch",
      {
        p_new_batch_id: batchId,
      }
    );

    if (supersedeError) {
      throw new Error(supersedeError.message);
    }
  }

  return {
    ok: true,
    batch_id: batchId,
    report_family_key: "DSW",
    report_shape_key: "DSW_DAILY_SERVICE_WORKSHEET",
    snapshot_kind: snapshotKind,
    service_date: serviceDate,
    inserted_row_count: stagedRows.length,
    inserted_summary_row_count: stagedSummaryRows.length,
    matched_route_count: matchedCount,
    unmatched_route_count: stagedRows.length - matchedCount,
    row_classification: rowClassification,
    candidate_preview: candidatePreview,
  };
}
