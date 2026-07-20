import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };
type ParsedRow = Record<string, unknown>;

const DRO_PM_HEADERS = [
  "WA NAME", "WA #", "ROUTE TYPE", "Distance", "TIME", "TIME COMMITS",
  "LP STOPS", "LP PACKAGES", "BULK STOPS", "BULK PKGS",
  "SMALL STOPS", "SMALL PKGS", "REG STOPS", "REG PKGS",
];

const DRO_AM_HEADERS = [
  "SERVICE AREA", "WA NAME", "WA #", "ROUTE TYPE",
  "CAPACITY", "TIME", "DISTANCE", "TOTAL STOPS",
  "TIME CRITICAL", "MISSED TIME CRT.",
  "Delivery - STOPS", "Delivery - PKGS.",
];

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

function normalizeDro(raw: ParsedRow, frame: "AM" | "PM") {
  if (frame === "AM") {
    const stops = toInteger(raw["TOTAL STOPS"]) ?? 0;
    const packages = toInteger(raw["Delivery - PKGS."]) ?? 0;

    return {
      wa_name: cellText(raw["WA NAME"]),
      wa_number: cellText(raw["WA #"]),
      route_type: cellText(raw["ROUTE TYPE"]),
      distance: toNumber(raw["DISTANCE"]),
      planned_time: toNumber(raw["TIME"]),
      time_commits: toInteger(raw["TIME CRITICAL"]) ?? 0,
      lp_stops: stops,
      lp_packages: packages,
      bulk_stops: 0,
      bulk_packages: 0,
      small_stops: 0,
      small_packages: 0,
      reg_stops: 0,
      reg_packages: 0,
    };
  }

  return {
    wa_name: cellText(raw["WA NAME"]),
    wa_number: cellText(raw["WA #"]),
    route_type: cellText(raw["ROUTE TYPE"]),
    distance: toNumber(raw["Distance"]),
    planned_time: toNumber(raw["TIME"]),
    time_commits: toInteger(raw["TIME COMMITS"]) ?? 0,
    lp_stops: toInteger(raw["LP STOPS"]) ?? 0,
    lp_packages: toInteger(raw["LP PACKAGES"]) ?? 0,
    bulk_stops: toInteger(raw["BULK STOPS"]) ?? 0,
    bulk_packages: toInteger(raw["BULK PKGS"]) ?? 0,
    small_stops: toInteger(raw["SMALL STOPS"]) ?? 0,
    small_packages: toInteger(raw["SMALL PKGS"]) ?? 0,
    reg_stops: toInteger(raw["REG STOPS"]) ?? 0,
    reg_packages: toInteger(raw["REG PKGS"]) ?? 0,
  };
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
    const serviceDate = cellText(form.get("service_date"));
    const requestedFrame = cellText(form.get("report_frame")).toUpperCase();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    if (!serviceDate) {
      return NextResponse.json({ error: "Report date is required." }, { status: 400 });
    }

    if (
      requestedFrame &&
      !["AM", "PM"].includes(requestedFrame)
    ) {
      return NextResponse.json({ error: "DRO frame must be AM or PM." }, { status: 400 });
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

    const fccHeaderSheetName =
      workbook.SheetNames.find((name) => normalizeHeader(name) === "header") ?? null;
    const fccDetailSheetName =
      workbook.SheetNames.find((name) => normalizeHeader(name) === "work area details") ?? null;

    if (fccHeaderSheetName && fccDetailSheetName) {
      const headerRows = sheetRows(workbook, fccHeaderSheetName);
      const detailRows = sheetRows(workbook, fccDetailSheetName);
      const detailHeaderIndex = findHeaderRow(detailRows, FCC_DETAIL_HEADERS);

      if (detailHeaderIndex < 0) {
        return NextResponse.json(
          { error: "FCC Work Area Details headers were not detected." },
          { status: 400 }
        );
      }

      const sourceReportName = headerValue(headerRows, ["Page"]);
      const reportDateText = headerValue(headerRows, ["Date"]);
      const headerServiceDate = parseUsDateToIso(reportDateText);
      const headerServiceArea = headerValue(headerRows, ["SA#", "Service Area", "SA"]);
      const displayWorkArea = headerValue(headerRows, ["Display Work Area"]);
      const exportGeneratedText = headerValue(headerRows, ["Export Generated"]);

      if (normalizeHeader(sourceReportName) !== "service area status") {
        return NextResponse.json(
          { error: "FCC Header sheet did not identify Service Area Status." },
          { status: 400 }
        );
      }

      if (headerServiceDate && headerServiceDate !== serviceDate) {
        return NextResponse.json(
          { error: `FCC header date ${headerServiceDate} does not match selected report date ${serviceDate}.` },
          { status: 400 }
        );
      }

      const { data: ownershipRows, error: ownershipError } = await supabase
        .from("company_contract_config")
        .select("*")
        .eq("company_id", company.id)
        .eq("status", "ACTIVE")
        .lte("effective_start_date", serviceDate)
        .or(`effective_end_date.is.null,effective_end_date.gte.${serviceDate}`)
        .order("effective_start_date", { ascending: false });

      if (ownershipError) {
        return NextResponse.json({ error: ownershipError.message }, { status: 500 });
      }

      const ownership = ownershipRows?.[0] ?? null;
      if (!ownership) {
        return NextResponse.json(
          { error: "No active contract/service-area configuration found for this report date." },
          { status: 400 }
        );
      }

      if (headerServiceArea && ownership.service_area && headerServiceArea !== ownership.service_area) {
        return NextResponse.json(
          { error: `FCC service area ${headerServiceArea} does not match configured service area ${ownership.service_area}.` },
          { status: 400 }
        );
      }

      const { data: routeRows, error: routeError } = await supabase
        .from("route_baseline")
        .select("id, route_name, current_wa_num, route_location, route_type, terminal_id")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .lte("effective_start", serviceDate)
        .or(`effective_end.is.null,effective_end.gte.${serviceDate}`);

      if (routeError) {
        return NextResponse.json({ error: routeError.message }, { status: 500 });
      }

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
          routeRows?.find(
            (row) => normalizeWaNumber(row.current_wa_num) === fcc.wa_number_normalized
          ) ?? null;

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

      const { data: profile } = await supabase
        .from("user_profile")
        .select("profile_id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "stage_operations_fcc_report",
        {
          p_company_id: company.id,
          p_service_date: serviceDate,
          p_source_filename: file.name,
          p_source_hash: sourceHash,
          p_detected_sheet_name: fccDetailSheetName,
          p_detected_header_row: detailHeaderIndex + 1,
          p_detected_headers: FCC_DETAIL_HEADERS,
          p_row_count: parsedRows.length,
          p_route_row_count: stagedRows.length,
          p_participant_row_count: 0,
          p_skipped_row_count: parsedRows.length - stagedRows.length,
          p_uploaded_by_profile_id: profile?.profile_id ?? null,
          p_metadata_json: {
            file_size: file.size,
            sheet_count: workbook.SheetNames.length,
            uploaded_by_auth_user_id: auth.user.id,
            ownership_context: {
              config_id: ownership.id,
              contract_number: ownership.contract_number,
              terminal_identity: ownership.terminal_identity,
              service_area: ownership.service_area,
            },
            fcc_header: headerMeta,
            route_match: {
              matched: matchedCount,
              unmatched: stagedRows.length - matchedCount,
            },
          },
          p_rows: stagedRows,
        }
      );

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        batch_id: rpcResult?.batch_id ?? null,
        report_family_key: "FCC",
        report_shape_key: "FCC_WORK_AREA_SUMMARY",
        service_date: serviceDate,
        inserted_row_count: stagedRows.length,
        matched_route_count: matchedCount,
        unmatched_route_count: stagedRows.length - matchedCount,
        ownership_context: {
          contract_number: ownership.contract_number,
          terminal_identity: ownership.terminal_identity,
          service_area: ownership.service_area,
        },
        fcc_header: headerMeta,
      });
    }

    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json({ error: "Workbook has no sheets." }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      blankrows: true,
      defval: "",
    });

    const pmHeaderIndex = findHeaderRow(rows, DRO_PM_HEADERS);
    const amHeaderIndex = findHeaderRow(rows, DRO_AM_HEADERS);

    const detectedFrame =
      amHeaderIndex >= 0
        ? "AM"
        : pmHeaderIndex >= 0
          ? "PM"
          : null;

    const headerIndex =
      detectedFrame === "AM"
        ? amHeaderIndex
        : pmHeaderIndex;

    if (!detectedFrame || headerIndex < 0) {
      return NextResponse.json({ error: "DRO signature headers were not detected." }, { status: 400 });
    }

    const reportFrame = detectedFrame;

    if (
      requestedFrame &&
      requestedFrame !== detectedFrame
    ) {
      return NextResponse.json(
        {
          error: `Workbook detected as ${detectedFrame} but ${requestedFrame} was selected.`,
        },
        { status: 400 }
      );
    }

    const { data: ownershipRows, error: ownershipError } = await supabase
      .from("company_contract_config")
      .select("*")
      .eq("company_id", company.id)
      .eq("status", "ACTIVE")
      .lte("effective_start_date", serviceDate)
      .or(`effective_end_date.is.null,effective_end_date.gte.${serviceDate}`)
      .order("effective_start_date", { ascending: false });

    if (ownershipError) {
      return NextResponse.json({ error: ownershipError.message }, { status: 500 });
    }

    const ownership = ownershipRows?.[0] ?? null;
    if (!ownership) {
      return NextResponse.json(
        { error: "No active contract/service-area configuration found for this report date." },
        { status: 400 }
      );
    }

    const { data: routeRows, error: routeError } = await supabase
      .from("route_baseline")
      .select("id, route_name, current_wa_num, route_location, route_type, terminal_id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .lte("effective_start", serviceDate)
      .or(`effective_end.is.null,effective_end.gte.${serviceDate}`);

    if (routeError) {
      return NextResponse.json({ error: routeError.message }, { status: 500 });
    }

    function findRouteMatch(raw: ParsedRow) {
      const waName = cellText(raw["WA NAME"]);
      const waNumber = cellText(raw["WA #"]);

      const byWa = routeRows?.find((row) => cellText(row.current_wa_num) === waNumber);
      if (byWa) return { row: byWa, method: "WA_NUMBER" };

      const byName = routeRows?.find(
        (row) => cellText(row.route_name).toLowerCase() === waName.toLowerCase()
      );
      if (byName) return { row: byName, method: "ROUTE_NAME" };

      return { row: null, method: "NONE" };
    }

    const parsedRows = objectRows(rows, headerIndex).filter(
      ({ raw }) => cellText(raw["WA NAME"]) || cellText(raw["WA #"])
    );

    const stagedRows = parsedRows.map(({ raw, source_row_index }) => {
      const dro = normalizeDro(raw, reportFrame);
      const routeMatch = findRouteMatch(raw);

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
          route_baseline_id: routeMatch.row?.id ?? null,
          route_match_method: routeMatch.method,
        },
        source_route_key: dro.wa_name || dro.wa_number || null,
        source_wa_number: dro.wa_number || null,
      };
    });

    const matchedCount = stagedRows.filter(
      (row) => row.normalized_row_json.route_match_method !== "NONE"
    ).length;

    const { data: profile } = await supabase
      .from("user_profile")
      .select("profile_id")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "stage_operations_dro_report",
      {
        p_company_id: company.id,
        p_service_date: serviceDate,
        p_report_frame: reportFrame,
        p_source_filename: file.name,
        p_source_hash: sourceHash,
        p_detected_sheet_name: sheetName,
        p_detected_header_row: headerIndex + 1,
        p_detected_headers:
          detectedFrame === "AM"
            ? DRO_AM_HEADERS
            : DRO_PM_HEADERS,
        p_row_count: parsedRows.length,
        p_route_row_count: stagedRows.length,
        p_participant_row_count: 0,
        p_skipped_row_count: parsedRows.length - stagedRows.length,
        p_uploaded_by_profile_id: profile?.profile_id ?? null,
        p_metadata_json: {
          file_size: file.size,
          sheet_count: workbook.SheetNames.length,
          uploaded_by_auth_user_id: auth.user.id,
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
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batch_id: rpcResult?.batch_id ?? null,
      report_family_key: "DRO",
      report_shape_key:
        detectedFrame === "AM"
          ? "DRO_AM_ROUTE_READINESS"
          : "DRO_PM_ROUTE_PROJECTION",
      report_frame: reportFrame,
      service_date: serviceDate,
      inserted_row_count: stagedRows.length,
      matched_route_count: matchedCount,
      unmatched_route_count: stagedRows.length - matchedCount,
      ownership_context: {
        contract_number: ownership.contract_number,
        terminal_identity: ownership.terminal_identity,
        service_area: ownership.service_area,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
