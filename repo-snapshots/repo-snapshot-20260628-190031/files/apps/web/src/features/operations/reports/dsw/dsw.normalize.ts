import type { DswMeta, DswRouteMatch, ParsedRow } from "./dsw.types";
import { cellText, toInteger, toNumber } from "./dsw.parse";

export function normalizeDsw(raw: ParsedRow, routeMatch: DswRouteMatch, meta: DswMeta) {
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

export function normalizeDswSummary(raw: ParsedRow, meta: DswMeta) {
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
