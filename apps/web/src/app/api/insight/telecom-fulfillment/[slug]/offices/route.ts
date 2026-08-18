import { NextResponse } from "next/server";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import type { ItfOfficeOption } from "@/features/insight-telecom/roster/itfRosterForm";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type OfficeRequest = {
  locationCode?: string;
  officeName?: string;
  address?: string;
  subRegion?: string;
};

type OfficeResult = {
  office_id: string;
  company_location_id: string;
  location_code: string;
  location_name: string;
  office_name: string;
  address: string | null;
  sub_region: string | null;
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

  const body = await request.json() as OfficeRequest;
  const locationCode = body.locationCode?.trim();
  const officeName = body.officeName?.trim();

  if (!locationCode || !officeName) {
    return NextResponse.json(
      { error: "A primary location and office name are required." },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("itf_create_company_office", {
    p_company_slug: context.company_slug,
    p_location_code: locationCode,
    p_office_name: officeName,
    p_address: body.address?.trim() || null,
    p_sub_region: body.subRegion?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = (Array.isArray(data) ? data[0] : data) as OfficeResult | null;
  if (!result) {
    return NextResponse.json({ error: "The office was not returned after creation." }, { status: 500 });
  }

  const office: ItfOfficeOption = {
    id: result.office_id,
    locationId: result.company_location_id,
    workforceUnit: result.location_code,
    locationName: result.location_name,
    officeName: result.office_name,
    address: result.address ?? "",
    subRegion: result.sub_region ?? "",
  };

  return NextResponse.json({ office }, { status: 201 });
}
