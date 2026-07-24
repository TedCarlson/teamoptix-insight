import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { validateVin } from "@/features/fleet/lib/vin";

const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
const numberOrNull = (input: unknown) => input === "" || input == null ? null : Number(input);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const vinInput = value(body.vin);
  const vin = vinInput ? validateVin(vinInput) : null;
  if (vin && !vin.valid) return NextResponse.json({ error: vin.error }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_fleet_vehicle", {
    p_company_slug: slug, p_vehicle_id: value(body.vehicle_id) || null,
    p_unit_number: value(body.unit_number), p_vehicle_class_key: value(body.vehicle_class_key),
    p_vehicle_type: value(body.vehicle_type) || "STEP_VAN", p_status: value(body.status) || "READY",
    p_year: numberOrNull(body.year), p_make: value(body.make), p_model: value(body.model), p_vin: vin?.vin ?? "",
    p_plate_number: value(body.plate_number), p_plate_state: value(body.plate_state), p_odometer_miles: numberOrNull(body.odometer_miles),
    p_wheel_size: value(body.wheel_size), p_front_tire_size: value(body.front_tire_size), p_rear_tire_size: value(body.rear_tire_size),
    p_rear_tire_configuration: value(body.rear_tire_configuration), p_tire_type: value(body.tire_type),
    p_gvwr_lbs: numberOrNull(body.gvwr_lbs), p_gvwr_source: value(body.gvwr_source) || null,
    p_gvwr_verified_status: value(body.gvwr_verified_status) || "UNVERIFIED",
    p_gvwr_evidence_reference: value(body.gvwr_evidence_reference) || null,
    p_effective_start_date: value(body.effective_start_date) || new Date().toISOString().slice(0, 10),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const decodeId = value(body.vin_decode_id);
  let warning = "";
  if (decodeId && data) {
    const { error: linkError } = await supabase.rpc("link_company_fleet_vin_decode", {
      p_company_slug: slug,
      p_decode_id: decodeId,
      p_vehicle_id: data,
    });
    if (linkError) warning = `Vehicle saved, but VIN decode provenance was not linked: ${linkError.message}`;
  }
  return NextResponse.json({ ok: true, vehicle_id: data, warning: warning || undefined });
}
