import { NextResponse } from "next/server";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import type {
  ItfRegionOption,
  ItfWorkforceUnitOption,
} from "@/features/insight-telecom/roster/itfRosterForm";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RegionRequest = {
  action?: "create-region" | "assign-location";
  divisionId?: string;
  regionName?: string;
  regionCode?: string;
  locationId?: string;
  regionId?: string;
  effectiveFrom?: string;
};

type RegionResult = {
  region_id: string;
  division_id: string;
  division_name: string;
  division_code: string;
  region_name: string;
  region_code: string;
};

type WorkforceUnitResult = RegionResult & {
  location_id: string;
  location_code: string;
  location_name: string;
};

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const context = await resolveItfWorkspaceContext(slug);

  if (!context?.can_enter) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (!context.can_manage) {
    return NextResponse.json({ error: "Company management access is required." }, { status: 403 });
  }

  const body = await request.json() as RegionRequest;
  const supabase = await getSupabaseServerClient();

  if (body.action === "create-region") {
    const divisionId = body.divisionId?.trim();
    const regionName = body.regionName?.trim();
    const regionCode = body.regionCode?.trim();
    if (!divisionId || !regionName || !regionCode) {
      return NextResponse.json({ error: "Division, region name, and region code are required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_create_company_region", {
      p_company_slug: context.company_slug,
      p_division_id: divisionId,
      p_region_name: regionName,
      p_region_code: regionCode,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const result = (Array.isArray(data) ? data[0] : data) as RegionResult | null;
    if (!result) return NextResponse.json({ error: "The region was not returned after creation." }, { status: 500 });

    const region: ItfRegionOption = {
      id: result.region_id,
      divisionId: result.division_id,
      divisionName: result.division_name,
      divisionCode: result.division_code,
      regionName: result.region_name,
      regionCode: result.region_code,
    };
    return NextResponse.json({ region }, { status: 201 });
  }

  if (body.action === "assign-location") {
    const locationId = body.locationId?.trim();
    const regionId = body.regionId?.trim();
    const effectiveFrom = body.effectiveFrom?.trim();
    if (!locationId || !regionId || !effectiveFrom) {
      return NextResponse.json({ error: "Location, region, and effective date are required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_assign_company_location_region", {
      p_company_slug: context.company_slug,
      p_location_id: locationId,
      p_region_id: regionId,
      p_effective_from: effectiveFrom,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const result = (Array.isArray(data) ? data[0] : data) as WorkforceUnitResult | null;
    if (!result) return NextResponse.json({ error: "The workforce unit was not returned after assignment." }, { status: 500 });

    const workforceUnit: ItfWorkforceUnitOption = {
      id: result.location_id,
      locationCode: result.location_code,
      locationName: result.location_name,
      divisionId: result.division_id,
      divisionName: result.division_name,
      divisionCode: result.division_code,
      regionId: result.region_id,
      regionName: result.region_name,
      regionCode: result.region_code,
    };
    return NextResponse.json({ workforceUnit });
  }

  return NextResponse.json({ error: "A supported region action is required." }, { status: 400 });
}
