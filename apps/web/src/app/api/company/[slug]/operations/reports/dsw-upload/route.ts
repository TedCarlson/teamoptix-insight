import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";


type RouteContext = { params: Promise<{ slug: string }> };
type ParsedRow = Record<string, unknown>;

const DSW_HEADERS = [
  "Svc Area #",
  "WA Name",
  "Veh #",
  "Driver Name",
  "WA#",
  "VScan Pkgs",
  "Del Stps",
  "PU Stps",
  "DIFF",
  "Act Del Stps",
  "Act Del Pkgs",
  "Act PU Stps",
  "Act PU Pkgs",
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

function toNumber(value: unknown) {
  const text = cellText(value).replace(/,/g, "").replace("%", "");
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
    .filter(({ raw }) => Object.values(raw).some((value) => cellText(value)));
}

function extractMeta(rows: unknown[][]) {
  const flat = rows.flat().map(cellText);
  const metaLine = flat.find((cell) => cell.startsWith("FedEx - "));
  const generatedLine = flat.find((cell) => cell.startsWith("Generated - "));

  const match = metaLine?.match(
    /^FedEx - (.+?) - Contract: (.+?) - (\d{1,2}\/\d{1,2}\/\d{4})$/
  );

  return {
    terminal_identity: match?.[1] ?? null,
    contract_filter: match?.[2] ?? null,
    service_date_text: match?.[3] ?? null,
    generated_at_text: generatedLine?.replace("Generated - ", "") ?? null,
  };
}

function normalizeDsw(raw: ParsedRow, routeMatch: { id: string | null; method: string }, meta: ReturnType<typeof extractMeta>) {
  return {
    source_contract: "DSW_DAILY_SERVICE_WORKSHEET",
    terminal_identity: meta.terminal_identity,
    contract_filter: meta.contract_filter,
    generated_at_text: meta.generated_at_text,

    service_area: cellText(raw["Svc Area #"]),
    wa_name: cellText(raw["WA Name"]),
    vehicle_text: cellText(raw["Veh #"]),
    driver_name: cellText(raw["Driver Name"]),
    wa_number: cellText(raw["WA#"]),

    vscan_packages: toInteger(raw["VScan Pkgs"]),
    planned_delivery_stops: toInteger(raw["Del Stps"]),
    planned_pickup_stops: toInteger(raw["PU Stps"]),
    diff: toInteger(raw["DIFF"]),
    actual_delivery_stops: toInteger(raw["Act Del Stps"]),
    actual_delivery_packages: toInteger(raw["Act Del Pkgs"]),
    actual_pickup_stops: toInteger(raw["Act PU Stps"]),
    actual_pickup_packages: toInteger(raw["Act PU Pkgs"]),

    ils_percent: toNumber(raw["ILS%"]),
    ils_impact_packages: toInteger(raw["ILS Impact Pkgs"]),
    non_delivered_stops: toInteger(raw["Non Delvd Stps"]),
    code_85: toInteger(raw["Code 85"]),
    all_status_code_packages: toInteger(raw["All Status Code Pkgs"]),
    pl_ml: toInteger(raw["P'L M'L"]),
    dna: toInteger(raw["DNA"]),
    send_again: toInteger(raw["Snd Agn"]),
    exceptions: toInteger(raw["Exc's"]),
    vsa_star_diff: toInteger(raw["VSA vs STAR (DIFF)"]),
    return_scans_percent: toNumber(raw["% Returns Scans"]),
    miles: toNumber(raw["Miles"]),
    on_road_hours: cellText(raw["On Road Hours"]) || null,
    on_duty_hours: cellText(raw["On Duty Hours"]) || null,
    potential_dot_hours_violations: toInteger(raw["Pot. DOT Hrs Viols"]),
    next_available_on_duty: cellText(raw["Next Avail On Duty"]) || null,
    potential_missed_pickups: toInteger(raw["Pot. Miss PUs"]),
    early_late_pickups: toInteger(raw["E/L PUs"]),
    required_signature: toInteger(raw["Req. Sig."]),
    date_certain: toInteger(raw["Date Certain"]),
    evening: toInteger(raw["Evening"]),
    appointment: toInteger(raw["Appt"]),

    route_baseline_id: routeMatch.id,
    route_match_method: routeMatch.method,
  };
}

function footerNumber(raw: ParsedRow, header: string) {
  return toNumber(raw[header]);
}

function footerInteger(raw: ParsedRow, header: string) {
  return toInteger(raw[header]);
}

function normalizeDswSummary(raw: ParsedRow, meta: ReturnType<typeof extractMeta>) {
  return {
    source_contract: "DSW_DAILY_SERVICE_WORKSHEET",
    terminal_identity: meta.terminal_identity,
    contract_filter: meta.contract_filter,
    generated_at_text: meta.generated_at_text,

    service_area: cellText(raw["Svc Area #"]),
    wa_name: cellText(raw["WA Name"]),
    vehicle_text: cellText(raw["Veh #"]),
    driver_name: cellText(raw["Driver Name"]),
    wa_number: cellText(raw["WA#"]),

    // DSW footer rows place totals under shifted visible columns.
    // These mappings are semantic footer mappings, not route-row mappings.
    vscan_packages: footerInteger(raw, "Del Stps"),
    planned_delivery_stops: footerInteger(raw, "PU Stps"),
    planned_pickup_stops: footerInteger(raw, "DIFF"),
    diff: footerInteger(raw, "Act Del Stps"),
    actual_delivery_stops: footerInteger(raw, "Act Del Pkgs"),
    actual_delivery_packages: footerInteger(raw, "Act PU Stps"),
    actual_pickup_stops: footerInteger(raw, "Act PU Pkgs"),
    actual_pickup_packages: footerInteger(raw, "ILS%"),

    ils_percent: footerNumber(raw, "ILS Impact Pkgs"),
    ils_impact_packages: footerInteger(raw, "Non Delvd Stps"),
    non_delivered_stops: footerInteger(raw, "Code 85"),
    code_85: footerInteger(raw, "All Status Code Pkgs"),
    all_status_code_packages: footerInteger(raw, "P'L M'L"),
    pl_ml: footerInteger(raw, "DNA"),
    dna: footerInteger(raw, "Snd Agn"),
    send_again: footerInteger(raw, "Exc's"),
    exceptions: footerInteger(raw, "VSA vs STAR (DIFF)"),
    vsa_star_diff: footerInteger(raw, "% Returns Scans"),
    return_scans_percent: footerNumber(raw, "Miles"),
    miles: footerNumber(raw, "On Road Hours"),
    on_road_hours: footerNumber(raw, "On Duty Hours"),
    on_duty_hours: footerNumber(raw, "Pot. DOT Hrs Viols"),
    potential_dot_hours_violations: footerInteger(raw, "Next Avail On Duty"),
    next_available_on_duty: cellText(raw["Pot. Miss PUs"]) || null,
    potential_missed_pickups: footerInteger(raw, "E/L PUs"),
    early_late_pickups: footerInteger(raw, "Req. Sig."),
    required_signature: footerInteger(raw, "Date Certain"),
    date_certain: footerInteger(raw, "Evening"),
    evening: footerInteger(raw, "Appt"),
    appointment: null,
  };
}

function summaryScope(label: string) {
  if (/^contract\s+/i.test(label) && /\stotal$/i.test(label)) return "CONTRACT";
  if (/^colocation total$/i.test(label)) return "COLOCATION";
  return null;
}

function contractCodeFromLabel(label: string) {
  const match = label.match(/^Contract\s+(.+?)\s+Total$/i);
  return match?.[1] ?? null;
}

function excelDateToIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const parts = value.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return value;
}

function routeActiveOn(route: any, serviceDate: string) {
  const start = cellText(route.effective_start);
  const end = cellText(route.effective_end);
  if (start && start > serviceDate) return false;
  if (end && end < serviceDate) return false;
  return true;
}

function findRouteMatch(raw: ParsedRow, routes: any[], serviceDate: string) {
  const waName = cellText(raw["WA Name"]);
  const waNumber = cellText(raw["WA#"]);
  const scoped = routes.filter((route) => routeActiveOn(route, serviceDate));

  const byWaScoped = scoped.find((route) => cellText(route.current_wa_num) === waNumber);
  if (byWaScoped) return { id: byWaScoped.id, method: "WA_NUMBER_DATE_SCOPED" };

  const byNameScoped = scoped.find(
    (route) => cellText(route.route_name).toLowerCase() === waName.toLowerCase()
  );
  if (byNameScoped) return { id: byNameScoped.id, method: "ROUTE_NAME_DATE_SCOPED" };

  const byWa = routes.find((route) => cellText(route.current_wa_num) === waNumber);
  if (byWa) return { id: byWa.id, method: "WA_NUMBER_ANY_ACTIVE" };

  const byName = routes.find(
    (route) => cellText(route.route_name).toLowerCase() === waName.toLowerCase()
  );
  if (byName) return { id: byName.id, method: "ROUTE_NAME_ANY_ACTIVE" };

  return { id: null, method: "NONE" };
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
    const serviceDate = requestedDate || (meta.service_date_text ? excelDateToIso(meta.service_date_text) : "");

    if (!serviceDate) {
      return NextResponse.json({ error: "Report date is required." }, { status: 400 });
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

    const allParsedRows = objectRows(rows, headerIndex).filter(({ raw }) => {
      const first = cellText(raw["Svc Area #"]);
      if (!first) return false;
      if (first.startsWith("Access is restricted")) return false;
      if (first.startsWith("Due to stop rate")) return false;
      return cellText(raw["WA Name"]) || cellText(raw["WA#"]) || Boolean(summaryScope(first));
    });

    const parsedRows = allParsedRows.filter(({ raw }) => {
      const first = cellText(raw["Svc Area #"]);
      if (summaryScope(first)) return false;
      return cellText(raw["WA Name"]) || cellText(raw["WA#"]);
    });

    const summaryRows = allParsedRows.filter(({ raw }) =>
      Boolean(summaryScope(cellText(raw["Svc Area #"])))
    );

    const stagedRows = parsedRows.map(({ raw, source_row_index }) => {
      const routeMatch = findRouteMatch(raw, routes ?? [], serviceDate);
      const normalized = normalizeDsw(raw, routeMatch, meta);

      return {
        sheet_name: sheetName,
        source_row_index,
        row_kind: "ROUTE",
        raw_row_json: raw,
        normalized_row_json: normalized,
        source_route_key: cellText(raw["WA Name"]) || cellText(raw["WA#"]) || null,
        source_wa_number: cellText(raw["WA#"]) || null,
        source_driver_name: cellText(raw["Driver Name"]) || null,
        source_dswid: cellText(raw["Driver Name"]) || null,
      };
    });

    const stagedSummaryRows = summaryRows.map(({ raw, source_row_index }) => {
      const label = cellText(raw["Svc Area #"]);
      const scope = summaryScope(label) ?? "SUMMARY";

      return {
        service_date: serviceDate,
        summary_scope: scope,
        summary_label: label,
        contract_code: contractCodeFromLabel(label),
        terminal_code: meta.terminal_identity,
        source_row_index,
        raw_row_json: raw,
        normalized_row_json: normalizeDswSummary(raw, meta),
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
        p_metadata_json: {
          file_size: file.size,
          sheet_count: workbook.SheetNames.length,
          uploaded_by_auth_user_id: auth.user.id,
          terminal_identity: meta.terminal_identity,
          contract_filter: meta.contract_filter,
          generated_at_text: meta.generated_at_text,
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

    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      report_family_key: "DSW",
      report_shape_key: "DSW_DAILY_SERVICE_WORKSHEET",
      snapshot_kind: "IN_DAY",
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
