import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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
  summaryScope,
  excelDateToIso,
  deriveDswSnapshotKind,
} from "@/features/operations/reports/dsw/dsw.metadata";
import { classifyDswRows } from "@/features/operations/reports/dsw/dsw.classify";
import {
  buildDswStagedRows,
  buildDswStagedSummaryRows,
  countMatchedDswRoutes,
} from "@/features/operations/reports/dsw/dsw.stage";

export const runtime = "nodejs";


type RouteContext = { params: Promise<{ slug: string }> };









































export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: auth, error: userError } = await supabase.auth.getUser();
    if (userError || !auth.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const requestedDate = cellText(form.get("service_date"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceHash = createHash("sha256").update(buffer).digest("hex");

    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json({ error: "Workbook has no sheets." }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      blankrows: true,
      defval: "",
    });

    const meta = extractMeta(rows);
    const headerServiceDate = meta.service_date_text ? excelDateToIso(meta.service_date_text) : "";

    if (!headerServiceDate) {
      return NextResponse.json(
        { error: "DSW report date was not detected in the file header." },
        { status: 400 }
      );
    }

    if (requestedDate && requestedDate !== headerServiceDate) {
      return NextResponse.json(
        {
          error: `Submitted report date ${requestedDate} does not match DSW file header date ${headerServiceDate}.`,
        },
        { status: 400 }
      );
    }

    const serviceDate = headerServiceDate;
    const snapshotKind = deriveDswSnapshotKind(serviceDate);

    if (snapshotKind === "FUTURE") {
      return NextResponse.json(
        { error: "Future-dated DSW uploads are not supported." },
        { status: 400 }
      );
    }

    const headerIndex = findHeaderRow(rows, DSW_HEADERS);
    if (headerIndex < 0) {
      return NextResponse.json({ error: "DSW signature headers were not detected." }, { status: 400 });
    }

    const { data: routes, error: routeError } = await supabase
      .from("route_baseline")
      .select("id, route_name, current_wa_num, effective_start, effective_end")
      .eq("company_id", company.id);

    if (routeError) {
      return NextResponse.json({ error: routeError.message }, { status: 500 });
    }

    const classifiedRows = classifyDswRows(
      objectRows(rows, headerIndex)
    );

    const parsedRows = classifiedRows.filter(
      (row) => row.row_kind === "ROUTE"
    );

    const summaryRows = classifiedRows.filter(
      (row) => row.row_kind === "SUMMARY"
    );

    const stagedRows = buildDswStagedRows({
      rows: parsedRows,
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

    const { data: profile } = await supabase
      .from("user_profile")
      .select("profile_id")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();

    const uploadMetadata = {
      file_size: file.size,
      sheet_count: workbook.SheetNames.length,
      uploaded_by_auth_user_id: auth.user.id,
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
    };

    if (snapshotKind === "FINAL") {
      const { data: finalResult, error: finalError } = await supabase.rpc(
        "import_operations_dsw_finalized_day",
        {
          p_company_id: company.id,
          p_service_date: serviceDate,
          p_source_filename: file.name,
          p_source_hash: sourceHash,
          p_detected_headers: DSW_HEADERS,
          p_row_count: parsedRows.length,
          p_uploaded_by_profile_id: profile?.profile_id ?? null,
          p_metadata_json: uploadMetadata,
          p_rows: stagedRows,
          p_summary_rows: stagedSummaryRows,
        }
      );

      if (finalError) {
        return NextResponse.json({ error: finalError.message }, { status: 500 });
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
        return NextResponse.json(
          { error: payrollRebuildError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
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
      });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "stage_operations_dsw_report",
      {
        p_company_id: company.id,
        p_service_date: serviceDate,
        p_source_filename: file.name,
        p_source_hash: sourceHash,
        p_detected_sheet_name: sheetName,
        p_detected_header_row: headerIndex + 1,
        p_detected_headers: DSW_HEADERS,
        p_row_count: parsedRows.length,
        p_route_row_count: stagedRows.length,
        p_participant_row_count: 0,
        p_skipped_row_count: parsedRows.length - stagedRows.length,
        p_uploaded_by_profile_id: profile?.profile_id ?? null,
        p_metadata_json: uploadMetadata,
        p_rows: stagedRows,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const batchId =
      typeof rpcResult?.batch_id === "string" ? rpcResult.batch_id : null;

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
        return NextResponse.json({ error: summaryError.message }, { status: 500 });
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
        return NextResponse.json({ error: supersedeError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DSW upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
