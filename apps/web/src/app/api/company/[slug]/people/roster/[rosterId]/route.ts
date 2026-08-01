import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadRosterAuthoritativeDto } from "@/features/people/server/loadRosterAuthoritativeDto";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function loadCompany(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  slug: string,
) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const company = await loadCompany(supabase, slug);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 },
      );
    }

    const roster = await loadRosterAuthoritativeDto({
      supabase,
      companySlug: slug,
      companyId: company.id,
      rosterId,
    });

    if (!roster) {
      return NextResponse.json(
        { error: "Roster record not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ roster }, { status: 200 });
  } catch (error) {
    console.error("[roster-detail:get] failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load roster record.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      );
    }

    const company = await loadCompany(supabase, slug);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 },
      );
    }

    const current = await loadRosterAuthoritativeDto({
      supabase,
      companySlug: slug,
      companyId: company.id,
      rosterId,
    });

    if (!current) {
      return NextResponse.json(
        { error: "Roster record not found." },
        { status: 404 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      phone?: unknown;
    };

    const email = Object.prototype.hasOwnProperty.call(body, "email")
      ? normalizeNullableText(body.email)?.toLowerCase() ?? null
      : current.email;

    const phone = Object.prototype.hasOwnProperty.call(body, "phone")
      ? normalizeNullableText(body.phone)
      : current.phone;

    const { error: updateError } = await supabase.rpc(
      "update_company_roster_details",
      {
        p_company_slug: slug,
        p_roster_id: rosterId,
        p_full_name: current.full_name,
        p_email: email,
        p_phone: phone,
        p_worker_type: current.worker_type,
        p_market_code: current.market_code,
        p_notes: current.notes,
        p_date_of_birth: current.date_of_birth,
        p_hire_date: current.hire_date,
        p_address_line_1: current.address_line_1,
        p_address_line_2: current.address_line_2,
        p_city: current.city,
        p_state_region: current.state_region,
        p_postal_code: current.postal_code,
        p_license_number: current.license_number,
        p_issuing_state: current.issuing_state,
        p_license_issue_date: current.license_issue_date,
        p_license_expiration_date: current.license_expiration_date,
        p_replace_blank_values: true,
      },
    );

    if (updateError) {
      return NextResponse.json(
        {
          error: "Failed to update roster contact info.",
          detail: updateError.message,
          code: updateError.code ?? null,
        },
        { status: 500 },
      );
    }

    await supabase.from("company_roster_event").insert({
      company_id: company.id,
      roster_id: rosterId,
      event_category: "identity",
      event_type: "contact_updated",
      event_detail: "Roster contact info updated from person detail.",
      event_metadata: {
        source: "person_detail_contact_editor",
        full_name: current.full_name,
        before: {
          email: current.email ?? null,
          phone: current.phone ?? null,
        },
        after: {
          email,
          phone,
        },
      },
      occurred_at: new Date().toISOString(),
    });

    const roster = await loadRosterAuthoritativeDto({
      supabase,
      companySlug: slug,
      companyId: company.id,
      rosterId,
    });

    return NextResponse.json(
      { ok: true, roster },
      { status: 200 },
    );
  } catch (error) {
    console.error("[roster-detail:patch] failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update roster contact info.",
      },
      { status: 500 },
    );
  }
}
