import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function identityKey(value: unknown) {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z,\s]/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.includes(",")) {
    const [last = "", rest = ""] = normalized.split(",");
    return `${last.trim()}|${rest.trim().split(" ")[0] ?? ""}`;
  }
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length > 1 ? `${parts.at(-1)}|${parts[0]}` : normalized;
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const serviceDate = request.nextUrl.searchParams.get("date")?.trim();
  const rosterId = request.nextUrl.searchParams.get("rosterId")?.trim() || null;
  if (!serviceDate) return NextResponse.json({ error: "Incident date is required.", routes: [] }, { status: 400 });

  const supabase = await getSupabaseServerClient();
  const { data: workspace, error: accessError } = await supabase.rpc("get_company_corrective_action_workspace", { p_company_slug: slug });
  if (accessError || !workspace?.company?.id) return NextResponse.json({ error: accessError?.message || "Company admin access required.", routes: [] }, { status: 403 });

  const roster = (Array.isArray(workspace.roster) ? workspace.roster : []) as Array<{ id: string; name: string }>;
  const rosterByName = new Map<string, { id: string; name: string }>(
    roster.map((person) => [identityKey(person.name), person])
  );

  const [{ data: evidence, error: evidenceError }, { data: packageEvidence, error: packageError }, attendanceResult] = await Promise.all([
    supabase.rpc("get_company_corrective_action_dsw_evidence", { p_company_slug: slug, p_service_date: serviceDate }),
    supabase.rpc("get_company_corrective_action_package_code_evidence", { p_company_slug: slug, p_service_date: serviceDate }),
    rosterId ? supabase.rpc("get_company_corrective_action_attendance_evidence", { p_company_slug: slug, p_roster_id: rosterId, p_through_date: serviceDate }) : Promise.resolve({ data: { last_attendance_can_date: null, events: [] }, error: null }),
  ]);
  if (evidenceError) return NextResponse.json({ error: evidenceError.message, routes: [] }, { status: 500 });
  if (packageError) return NextResponse.json({ error: packageError.message, routes: [] }, { status: 500 });
  if (attendanceResult.error) return NextResponse.json({ error: attendanceResult.error.message, routes: [] }, { status: 500 });

  const rows = Array.isArray(evidence?.rows) ? evidence.rows : [];
  const packageInstances = (Array.isArray(packageEvidence?.instances) ? packageEvidence.instances : []) as Array<Record<string, unknown>>;
  const source = evidence?.source ?? null;

  const routes = rows.map((row: any, index: number) => {
    const driver = rosterByName.get(identityKey(row.driver_name)) ?? null;
    const routeLabel = [row.wa_number, row.route_name].filter(Boolean).join(" · ") || `Route ${index + 1}`;
    const routeCodes = packageInstances.filter((item) => String(item.work_area_number ?? "").trim() === String(row.wa_number ?? "").trim() || String(item.work_area_name ?? "").trim() === String(row.route_name ?? "").trim());
    const codeCounts = routeCodes.reduce<Record<string, number>>((counts, item) => {
      const rawCode = item.star_status_code ?? item.vsa_status_code;
      const code = String(rawCode ?? "").trim().replace(/^0+(?=\d)/, "");
      if (code) counts[code] = (counts[code] ?? 0) + 1;
      return counts;
    }, {});
    return {
      key: String(row.row_id ?? `${row.wa_number ?? "route"}:${index}`),
      route_label: routeLabel,
      route_name: row.route_name ?? null,
      wa_number: row.wa_number ?? null,
      driver_name: row.driver_name ?? null,
      roster_id: driver?.id ?? null,
      roster_name: driver?.name ?? null,
      code_85_count: Number(row.code_85 ?? 0),
      planned_delivery_stops: Number(row.planned_delivery_stops ?? 0),
      actual_delivery_stops: Number(row.actual_delivery_stops ?? 0),
      actual_delivery_packages: Number(row.actual_delivery_packages ?? 0),
      planned_pickup_stops: Number(row.planned_pickup_stops ?? 0),
      actual_pickup_stops: Number(row.actual_pickup_stops ?? 0),
      actual_pickup_packages: Number(row.actual_pickup_packages ?? 0),
      exceptions: Number(row.exceptions ?? 0),
      dna_count: Number(row.dna ?? 0),
      send_again_count: Number(row.send_again ?? 0),
      non_delivered_stops: Number(row.non_delivered_stops ?? 0),
      all_status_code_packages: Number(row.all_status_code_packages ?? 0),
      required_signature_count: Number(row.required_signature ?? 0),
      potential_missed_pickups: Number(row.potential_missed_pickups ?? 0),
      early_late_pickups: Number(row.early_late_pickups ?? 0),
      miles: row.miles == null ? null : Number(row.miles),
      on_road_hours: row.on_road_hours ?? null,
      on_duty_hours: row.on_duty_hours ?? null,
      vehicle_text: row.vehicle_text ?? null,
      code_counts: codeCounts,
      code_instances: routeCodes.map((item) => ({ id: item.id, tracking_ref: item.tracking_ref, vision_label: item.vision_label, vehicle_number: item.vehicle_number, vsa_status_code: item.vsa_status_code, star_status_code: item.star_status_code, star_scan_at_local: item.star_scan_at_local })),
      source,
      source_id: row.row_id ?? evidence?.batch_id ?? null,
    };
  });

  return NextResponse.json({ service_date: serviceDate, source, routes, attendance: attendanceResult.data ?? { last_attendance_can_date: null, events: [] } });
}
