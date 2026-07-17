import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const terminalAddress = String(body?.terminal_address ?? "").trim();
    const zipCodes = Array.isArray(body?.zip_codes)
      ? Array.from(new Set(body.zip_codes.map((value: unknown) => String(value)).filter((value: string) => /^\d{5}$/.test(value))))
      : [];

    if (!terminalAddress || zipCodes.length === 0) {
      return NextResponse.json({ error: "Terminal address and ZIP Codes are required." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: access } = await supabase.rpc("access_context");
    const membership = Array.isArray(access?.memberships)
      ? access.memberships.find((item: Record<string, unknown>) => item.company_slug === slug)
      : null;
    const grants = Array.isArray(membership?.grants) ? membership.grants : [];
    const allowed = Boolean(access?.is_platform_owner) || (membership?.membership_status === "active" && (membership?.relationship_type === "admin" || grants.includes("opportunity_analysis")));
    if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const geocodeUrl = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
    geocodeUrl.searchParams.set("address", terminalAddress);
    geocodeUrl.searchParams.set("benchmark", "Public_AR_Current");
    geocodeUrl.searchParams.set("format", "json");
    const geocodeResponse = await fetch(geocodeUrl, { cache: "no-store" });
    if (!geocodeResponse.ok) throw new Error("The Census geocoder did not respond.");
    const geocode = await geocodeResponse.json();
    const match = geocode?.result?.addressMatches?.[0];
    if (!match?.coordinates) {
      return NextResponse.json({ error: "Terminal address could not be resolved." }, { status: 422 });
    }

    const latitude = Number(match.coordinates.y);
    const longitude = Number(match.coordinates.x);
    const { data, error } = await supabase.rpc("get_opportunity_zip_analysis", {
      p_zip_codes: zipCodes,
      p_terminal_latitude: latitude,
      p_terminal_longitude: longitude,
    });
    if (error) throw error;

    return NextResponse.json({
      terminal: {
        submitted_address: terminalAddress,
        matched_address: match.matchedAddress,
        latitude,
        longitude,
        source: "US Census Geocoder · Current Benchmark",
        status: "PRESUMED",
      },
      rows: data ?? [],
      unresolved_zip_codes: zipCodes.filter((zipCode) => !(data ?? []).some((row: { zip_code: string }) => row.zip_code === zipCode)),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ZIP analysis failed." }, { status: 500 });
  }
}
