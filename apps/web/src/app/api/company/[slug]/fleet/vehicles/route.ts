import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
const numberOrNull = (input: unknown) => input === "" || input == null ? null : Number(input);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_fleet_vehicle", {
    p_company_slug: slug, p_vehicle_id: value(body.vehicle_id) || null,
    p_unit_number: value(body.unit_number), p_vehicle_class_key: value(body.vehicle_class_key),
    p_vehicle_type: value(body.vehicle_type) || "STEP_VAN", p_status: value(body.status) || "READY",
    p_year: numberOrNull(body.year), p_make: value(body.make), p_model: value(body.model), p_vin: value(body.vin),
    p_plate_number: value(body.plate_number), p_plate_state: value(body.plate_state), p_odometer_miles: numberOrNull(body.odometer_miles),
    p_wheel_size: value(body.wheel_size), p_front_tire_size: value(body.front_tire_size), p_rear_tire_size: value(body.rear_tire_size),
    p_rear_tire_configuration: value(body.rear_tire_configuration), p_tire_type: value(body.tire_type),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, vehicle_id: data });
}
