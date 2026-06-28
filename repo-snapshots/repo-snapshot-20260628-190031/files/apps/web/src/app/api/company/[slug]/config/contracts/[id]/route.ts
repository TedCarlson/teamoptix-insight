import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: access } = await supabase.rpc("access_context");

    const membership =
      Array.isArray(access?.memberships)
        ? access.memberships.find((m: any) => m.company_slug === slug) ?? null
        : null;

    const canEdit =
      Boolean(access?.is_platform_owner) ||
      (membership?.relationship_type === "admin" &&
        membership?.membership_status === "active");

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await req.json();

    const {
      contract_number,
      terminal_identity,
      service_area,
      effective_start_date,
      effective_end_date,
      status,
    } = body ?? {};

    const { data, error } = await supabase
      .from("company_contract_config")
      .update({
        contract_number,
        terminal_identity,
        service_area,
        effective_start_date,
        effective_end_date: effective_end_date || null,
        status: status || "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", company.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update row.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
