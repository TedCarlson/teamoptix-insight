import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function resolveCompanyAndAccess(
  slug: string,
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
) {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return { error: "Company not found." };
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

  return {
    company,
    canEdit,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyAndAccess(slug, supabase);

    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error, rows: [] },
        { status: 404 }
      );
    }

    const { company } = resolved;

    const { data, error } = await supabase
      .from("company_contract_config")
      .select("*")
      .eq("company_id", company.id)
      .order("contract_number")
      .order("service_area");

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      company_id: company.id,
      rows: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load config.";

    return NextResponse.json(
      { error: message, rows: [] },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyAndAccess(slug, supabase);

    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error },
        { status: 404 }
      );
    }

    if (!resolved.canEdit) {
      return NextResponse.json(
        { error: "Forbidden." },
        { status: 403 }
      );
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
      .insert({
        company_id: resolved.company.id,
        contract_number,
        terminal_identity,
        service_area,
        effective_start_date,
        effective_end_date: effective_end_date || null,
        status: status || "ACTIVE",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { row: data },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create row.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
