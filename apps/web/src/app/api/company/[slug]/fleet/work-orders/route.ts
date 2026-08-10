import { NextRequest, NextResponse } from "next/server";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function getFleetClient(slug: string) {
  const supabase = await getSupabaseServerClient();
  const allowed = await hasCompanyWorkspaceAccess(supabase, slug, "fleet");
  return { allowed, supabase };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { allowed, supabase } = await getFleetClient(slug);
  if (!allowed) {
    return NextResponse.json({ error: "Fleet access is required." }, { status: 403 });
  }

  const body = await req.json();
  const { data, error } = await supabase.rpc("create_company_fleet_work_order", {
    p_company_slug: slug,
    p_vehicle_id: body.vehicle_id,
    p_defect_id: body.defect_id || null,
    p_title: body.title,
    p_scope: body.scope_of_work || "",
    p_priority: body.priority || "ROUTINE",
  });

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true, id: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { allowed, supabase } = await getFleetClient(slug);
  if (!allowed) {
    return NextResponse.json({ error: "Fleet access is required." }, { status: 403 });
  }

  const body = await req.json();
  const numberOrNull = (value: unknown) =>
    value === "" || value == null ? null : Number(value);
  const { error } = await supabase.rpc("update_company_fleet_work_order", {
    p_company_slug: slug,
    p_work_order_id: body.work_order_id,
    p_status: body.status,
    p_completion_notes: body.completion_notes || "",
    p_labor_cost: numberOrNull(body.labor_cost),
    p_parts_cost: numberOrNull(body.parts_cost),
    p_outside_cost: numberOrNull(body.outside_cost),
  });

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
