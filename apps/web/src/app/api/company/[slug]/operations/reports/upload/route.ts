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

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return cellText(value).toLowerCase().replace(/\s+/g, " ").replace(/\s+#/g, "#").trim();
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

function normalizeDro(raw: ParsedRow) {
  return {
    wa_name: cellText(raw["WA NAME"]),
    wa_number: cellText(raw["WA #"]),
    route_type: cellText(raw["ROUTE TYPE"]),
    distance: toNumber(raw["Distance"]),
    planned_time: toNumber(raw["TIME"]),
    time_commits: toInteger(raw["TIME COMMITS"]),
    lp_stops: toInteger(raw["LP STOPS"]),
    lp_packages: toInteger(raw["LP PACKAGES"]),
    bulk_stops: toInteger(raw["BULK STOPS"]),
    bulk_packages: toInteger(raw["BULK PKGS"]),
    small_stops: toInteger(raw["SMALL STOPS"]),
    small_packages: toInteger(raw["SMALL PKGS"]),
    reg_stops: toInteger(raw["REG STOPS"]),
    reg_packages: toInteger(raw["REG PKGS"]),
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
      const dro = normalizeDro(raw);
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
