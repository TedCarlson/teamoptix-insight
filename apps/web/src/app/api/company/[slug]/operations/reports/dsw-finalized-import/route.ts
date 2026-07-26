import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAutomationAccess } from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };
type CsvRow = Record<string, string>;

function cellText(value: unknown) {
  return String(value ?? "").trim();
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

function toPercentNumber(value: unknown) {
  const parsed = toNumber(value);
  return parsed === null ? null : parsed;
}

function timeToHours(value: unknown) {
  const text = cellText(value);
  if (!text) return null;

  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return toNumber(text);

  if (parts.length === 2) {
    return Number((parts[0] + parts[1] / 60).toFixed(2));
  }

  if (parts.length === 3) {
    return Number((parts[0] + parts[1] / 60 + parts[2] / 3600).toFixed(2));
  }

  return null;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = (rows[0] ?? []).map(cellText);
  const body = rows.slice(1).filter((line) => line.some((value) => cellText(value)));

  return {
    headers,
    rows: body.map((line) => {
      const item: CsvRow = {};
      headers.forEach((header, index) => {
        item[header] = cellText(line[index]);
      });
      return item;
    }),
  };
}

function normalizeOldDswRow(
  raw: CsvRow,
  ownership: any,
  routeMatch: { id: string | null; method: string }
) {
  return {
    station_code: cellText(raw["StationCode"]),
    service_date: cellText(raw["Data Date"]),
    archive_batch_date: cellText(raw["Batch Date"]),
    archive_batch_time: cellText(raw["Batch Time"]),
    legacy_unique_key: cellText(raw["UniqueKey"]),
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

    ils_percent: toPercentNumber(raw["ILS%"]),
    ils_impact_packages: toInteger(raw["ILS Impact Pkgs"]),
    non_delivered_stops: toInteger(raw["Non Delvd Stps"]),
    code_85: toInteger(raw["Code 85"]),
    all_status_code_packages: toInteger(raw["All Status Code Pkgs"]),
    pl_ml: toInteger(raw["P'L M'L"]),
    dna: toInteger(raw["DNA"]),
    send_again: toInteger(raw["Snd Agn"]),
    exceptions: toInteger(raw["Exc's"]),
    vsa_star_diff: toInteger(raw["VSA vs STAR (DIFF)"]),
    return_scans_percent: toPercentNumber(raw["% Returns Scans"]),

    miles: toNumber(raw["Miles"]),
    on_road_hours: timeToHours(raw["On Road Hours"]),
    on_duty_hours: timeToHours(raw["On Duty Hours"]),
    potential_dot_hours_violations: toInteger(raw["Pot. DOT Hrs Viols"]),
    next_available_on_duty: cellText(raw["Next Avail On Duty"]) || null,
    potential_missed_pickups: toInteger(raw["Pot. Miss PUs"]),
    early_late_pickups: toInteger(raw["E/L PUs"]),
    required_signature: toInteger(raw["Req. Sig."]),
    date_certain: toInteger(raw["Date Certain"]),
    evening: toInteger(raw["Evening"]),
    appointment: toInteger(raw["Appt"]),

    contract_number: ownership?.contract_number ?? null,
    terminal_identity: ownership?.terminal_identity ?? null,
    route_baseline_id: routeMatch.id,
    route_match_method: routeMatch.method,
  };
}

function routeMatchesServiceDate(route: any, serviceDate: string) {
  const start = cellText(route.effective_start);
  const end = cellText(route.effective_end);

  if (start && start > serviceDate) return false;
  if (end && end < serviceDate) return false;
  return true;
}

function findRouteMatch(raw: CsvRow, routes: any[]) {
  const serviceDate = cellText(raw["Data Date"]);
  const waNumber = cellText(raw["WA#"]);
  const waName = cellText(raw["WA Name"]).toLowerCase();

  const dateScoped = routes.filter((route) => routeMatchesServiceDate(route, serviceDate));

  const byWaDate = dateScoped.find((route) => cellText(route.current_wa_num) === waNumber);
  if (byWaDate) return { id: byWaDate.id, method: "WA_NUMBER_DATE_SCOPED" };

  const byNameDate = dateScoped.find(
    (route) => cellText(route.route_name).toLowerCase() === waName
  );
  if (byNameDate) return { id: byNameDate.id, method: "ROUTE_NAME_DATE_SCOPED" };

  const byWaAny = routes.find((route) => cellText(route.current_wa_num) === waNumber);
  if (byWaAny) return { id: byWaAny.id, method: "WA_NUMBER_ANY_ACTIVE" };

  const byNameAny = routes.find(
    (route) => cellText(route.route_name).toLowerCase() === waName
  );
  if (byNameAny) return { id: byNameAny.id, method: "ROUTE_NAME_ANY_ACTIVE" };

  return { id: null, method: "NONE" };
}

function findOwnership(serviceDate: string, serviceArea: string, configs: any[]) {
  const scoped = configs.find((row) => {
    const start = cellText(row.effective_start_date);
    const end = cellText(row.effective_end_date);

    if (cellText(row.service_area) !== serviceArea) return false;
    if (start && start > serviceDate) return false;
    if (end && end < serviceDate) return false;
    return true;
  });

  return scoped ?? configs.find((row) => cellText(row.service_area) === serviceArea) ?? configs[0] ?? null;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.allowed || !access.userId) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.status }
      );
    }

    const admin = createSupabaseServiceRoleClient();
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
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
    const csvText = buffer.toString("utf8");
    const parsed = parseCsv(csvText);

    const { data: profile } = await supabase
      .from("user_profile")
      .select("profile_id")
      .eq("auth_user_id", access.userId)
      .maybeSingle();

    const { data: configs, error: configError } = await supabase
      .from("company_contract_config")
      .select("*")
      .eq("company_id", company.id)
      .order("effective_start_date", { ascending: false });

    if (configError) {
      return NextResponse.json({ error: configError.message }, { status: 500 });
    }

    const { data: routes, error: routeError } = await supabase
      .from("route_baseline")
      .select("id, route_name, current_wa_num, effective_start, effective_end")
      .eq("company_id", company.id);

    if (routeError) {
      return NextResponse.json({ error: routeError.message }, { status: 500 });
    }

    const byDate = new Map<string, Array<{ source_row_index: number; raw: CsvRow }>>();

    parsed.rows.forEach((raw, index) => {
      const serviceDate = cellText(raw["Data Date"]);
      if (!serviceDate) return;

      const list = byDate.get(serviceDate) ?? [];
      list.push({ source_row_index: index + 2, raw });
      byDate.set(serviceDate, list);
    });

    const results: any[] = [];
    let totalInserted = 0;
    let totalMatched = 0;
    let totalUnmatched = 0;

    for (const [serviceDate, items] of Array.from(byDate.entries()).sort()) {
      const stagedRows = items.map(({ raw, source_row_index }) => {
        const ownership = findOwnership(serviceDate, cellText(raw["Svc Area #"]), configs ?? []);
        const routeMatch = findRouteMatch(raw, routes ?? []);
        const normalized = normalizeOldDswRow(raw, ownership, routeMatch);

        if (routeMatch.id) totalMatched += 1;
        else totalUnmatched += 1;

        return {
          source_row_index,
          raw_row_json: raw,
          normalized_row_json: normalized,
          source_route_key: cellText(raw["WA Name"]) || cellText(raw["WA#"]) || null,
          source_wa_number: cellText(raw["WA#"]) || null,
          source_driver_name: cellText(raw["Driver Name"]) || null,
        };
      });

      const { data, error } = await admin.rpc(
        "import_operations_dsw_finalized_day",
        {
          p_company_id: company.id,
          p_service_date: serviceDate,
          p_source_filename: file.name,
          p_source_hash: sourceHash,
          p_detected_headers: parsed.headers,
          p_row_count: items.length,
          p_uploaded_by_profile_id: profile?.profile_id ?? null,
          p_metadata_json: {
            source: "legacy_spreadsheet_archive",
            file_size: file.size,
            imported_by_auth_user_id: access.userId,
            route_match: {
              matched: stagedRows.filter((row) => row.normalized_row_json.route_baseline_id).length,
              unmatched: stagedRows.filter((row) => !row.normalized_row_json.route_baseline_id).length,
            },
          },
          p_rows: stagedRows,
        }
      );

      if (error) {
        return NextResponse.json(
          { error: error.message, failed_service_date: serviceDate },
          { status: 500 }
        );
      }

      totalInserted += stagedRows.length;
      results.push(data);
    }

    return NextResponse.json({
      ok: true,
      service_date_count: byDate.size,
      inserted_row_count: totalInserted,
      matched_route_count: totalMatched,
      unmatched_route_count: totalUnmatched,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import DSW finalized archive.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
