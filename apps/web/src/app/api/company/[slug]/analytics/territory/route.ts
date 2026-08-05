import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  straightLineMiles,
  zipNumber,
  type ZipIntelligenceReference,
} from "@/features/opportunity-analysis/zipIntelligence";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

type TerritorySource = {
  terminal?: {
    terminal_id?: string | null;
    terminal_code?: string | null;
    terminal_name?: string | null;
    submitted_address?: string | null;
    postal_code?: string | null;
    exact_latitude?: number | string | null;
    exact_longitude?: number | string | null;
    location_source?: string | null;
    location_verified_at?: string | null;
    location_precision?: "VERIFIED_POINT" | "ZIP_CENTROID" | null;
    reference_zip?: string | null;
    reference_latitude?: number | string | null;
    reference_longitude?: number | string | null;
    reference_source?: string | null;
    reference_method?: string | null;
  };
  coverage?: Record<string, unknown>;
  rows?: Array<ZipIntelligenceReference & Record<string, unknown>>;
};

function dateParameter(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

async function geocodeTerminal(address: string) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { next: { revalidate: 2_592_000 } });
  if (!response.ok) return null;
  const body = await response.json();
  const match = body?.result?.addressMatches?.[0];
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    matched_address: String(match.matchedAddress ?? address),
    latitude,
    longitude,
    source: "US Census Geocoder · Current Benchmark",
  };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const startDate = dateParameter(url.searchParams.get("startDate"));
    const endDate = dateParameter(url.searchParams.get("endDate"));

    if (!startDate || !endDate || startDate > endDate) {
      return NextResponse.json(
        { error: "A valid contract startDate and endDate are required." },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_company_territory_zip_report", {
      p_company_slug: slug,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const source = (data ?? {}) as TerritorySource;
    const submittedAddress = String(source.terminal?.submitted_address ?? "").trim();
    const hasExactTerminal = source.terminal?.exact_latitude !== null
      && source.terminal?.exact_latitude !== undefined
      && source.terminal?.exact_longitude !== null
      && source.terminal?.exact_longitude !== undefined;
    const exactTerminal = hasExactTerminal
      ? {
          matched_address: submittedAddress,
          latitude: zipNumber(source.terminal?.exact_latitude),
          longitude: zipNumber(source.terminal?.exact_longitude),
          source: "User-verified terminal point",
        }
      : null;
    const hasTerminalReference = source.terminal?.reference_latitude !== null
      && source.terminal?.reference_latitude !== undefined
      && source.terminal?.reference_longitude !== null
      && source.terminal?.reference_longitude !== undefined;
    const referencedTerminal = hasTerminalReference
      ? {
          matched_address: submittedAddress,
          latitude: zipNumber(source.terminal?.reference_latitude),
          longitude: zipNumber(source.terminal?.reference_longitude),
          source: `${String(source.terminal?.reference_source ?? "ZIP")} terminal ZIP centroid`,
        }
      : null;
    const geocodedTerminal = exactTerminal || referencedTerminal
      ? null
      : submittedAddress
        ? await geocodeTerminal(submittedAddress)
        : null;
    const sourceRows = source.rows ?? [];
    const terminalZip = submittedAddress.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? null;
    const terminalZipRow = terminalZip
      ? sourceRows.find(
          (row) => String(row.zip_code) === terminalZip && row.latitude !== null && row.longitude !== null,
        )
      : null;
    const terminal = exactTerminal ?? geocodedTerminal ?? referencedTerminal ?? (terminalZipRow
      ? {
          matched_address: submittedAddress,
          latitude: zipNumber(terminalZipRow.latitude),
          longitude: zipNumber(terminalZipRow.longitude),
          source: `${String(terminalZipRow.coordinate_source ?? "ZIP")} centroid fallback`,
        }
      : null);
    const rows = sourceRows.map((row) => {
      const latitude = zipNumber(row.latitude);
      const longitude = zipNumber(row.longitude);
      const hasCoordinates = row.latitude !== null && row.longitude !== null;
      const materializedDistance = typeof row.terminal_distance_miles === "number"
        || typeof row.terminal_distance_miles === "string"
        ? row.terminal_distance_miles
        : null;
      return {
        ...row,
        terminal_distance_miles:
          materializedDistance !== null && materializedDistance !== undefined
            ? zipNumber(materializedDistance)
            : terminal && hasCoordinates
            ? Math.round(
                straightLineMiles(
                  terminal.latitude,
                  terminal.longitude,
                  latitude,
                  longitude,
                ) * 100,
              ) / 100
            : null,
      };
    });

    return NextResponse.json(
      {
        terminal: {
          ...source.terminal,
          matched_address: terminal?.matched_address ?? null,
          latitude: terminal?.latitude ?? null,
          longitude: terminal?.longitude ?? null,
          geocode_source: terminal?.source ?? null,
          geocode_status: exactTerminal
            ? "VERIFIED"
            : geocodedTerminal
            ? "MATCHED"
            : referencedTerminal || terminal
              ? "ZIP_CENTROID"
              : submittedAddress
                ? "UNRESOLVED"
                : "NOT_CONFIGURED",
        },
        coverage: source.coverage ?? {},
        rows,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Territory analysis failed." },
      { status: 500 },
    );
  }
}
