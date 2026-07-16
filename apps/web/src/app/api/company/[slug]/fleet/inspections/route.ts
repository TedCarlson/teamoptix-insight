import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const body = await req.json().catch(() => ({}));
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_company_fleet_inspection", {
    p_company_slug: slug, p_vehicle_id: body.vehicle_id, p_inspection_type: body.inspection_type,
    p_odometer_miles: body.odometer_miles === "" ? null : Number(body.odometer_miles),
    p_safe_to_operate: Boolean(body.safe_to_operate), p_driver_notes: body.driver_notes ?? "", p_route_name: body.route_name ?? "", p_items: body.items ?? [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, inspection_id: data });
}
