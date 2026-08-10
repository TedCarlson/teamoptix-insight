import { NextRequest, NextResponse } from "next/server";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseGvwrRange, suggestedFleetVehicleType, validateVin } from "@/features/fleet/lib/vin";

type VpicResult = Record<string, string | null>;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const year = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1886 && parsed <= 2200 ? parsed : null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  if (!(await hasCompanyWorkspaceAccess(supabase, slug, "fleet"))) {
    return NextResponse.json({ error: "Fleet access is required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const validation = validateVin(text(body.vin));
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let payload: Record<string, unknown>;
  try {
    const endpoint = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(validation.vin)}?format=json`;
    const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`NHTSA vPIC returned HTTP ${response.status}.`);
    payload = await response.json() as Record<string, unknown>;
  } catch (caught) {
    const message = caught instanceof Error && caught.name === "AbortError"
      ? "NHTSA vPIC did not respond within 10 seconds."
      : caught instanceof Error ? caught.message : "Unable to decode VIN.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const result = (Array.isArray(payload.Results) ? payload.Results[0] : null) as VpicResult | null;
  if (!result) return NextResponse.json({ error: "NHTSA vPIC returned no decode result." }, { status: 502 });

  const gvwr = parseGvwrRange(result.GVWR);
  const suggestedType = suggestedFleetVehicleType(text(result.VehicleType), text(result.BodyClass));
  const { data: decodeId, error: recordError } = await supabase.rpc("record_company_fleet_vin_decode", {
    p_company_slug: slug,
    p_vin: validation.vin,
    p_provider_version: "NHTSA_VPIC",
    p_raw_response: payload,
    p_error_code: text(result.ErrorCode),
    p_error_text: text(result.ErrorText),
    p_suggested_make: text(result.Make),
    p_suggested_model: text(result.Model),
    p_suggested_year: year(result.ModelYear),
    p_suggested_body_class: text(result.BodyClass),
    p_suggested_vehicle_type: suggestedType,
    p_suggested_gvwr_from: gvwr.from,
    p_suggested_gvwr_to: gvwr.to,
  });
  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 400 });
  if (text(result.ErrorCode) && text(result.ErrorCode) !== "0") {
    return NextResponse.json({
      error: text(result.ErrorText) || "NHTSA vPIC could not decode this VIN.",
      decode_id: decodeId,
    }, { status: 422 });
  }

  return NextResponse.json({
    decode_id: decodeId,
    vin: validation.vin,
    error_code: text(result.ErrorCode),
    error_text: text(result.ErrorText),
    suggested: {
      year: year(result.ModelYear),
      make: text(result.Make),
      manufacturer: text(result.Manufacturer),
      model: text(result.Model),
      vehicle_type: suggestedType,
      decoded_vehicle_type: text(result.VehicleType),
      body_class: text(result.BodyClass),
      series: text(result.Series),
      trim: text(result.Trim),
      fuel_type: text(result.FuelTypePrimary),
      drive_type: text(result.DriveType),
      cab_type: text(result.CabType),
      brake_system: text(result.BrakeSystemType),
      plant_city: text(result.PlantCity),
      plant_country: text(result.PlantCountry),
      gvwr_label: text(result.GVWR),
      gvwr_from: gvwr.from,
      gvwr_to: gvwr.to,
    },
  });
}
