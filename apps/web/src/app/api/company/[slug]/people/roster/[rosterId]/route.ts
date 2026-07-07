import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: roster, error: rosterError } = await supabase
      .schema("core")
      .from("company_roster")
      .select(
        "id, company_id, profile_id, person_id, full_name, email, phone, worker_type, job_title, employment_status, market_code, hire_date, separation_date, reports_to_roster_id, invite_status, compliance_summary, notes"
      )
      .eq("company_id", company.id)
      .eq("id", rosterId)
      .single();

    if (rosterError || !roster) {
      return NextResponse.json(
        { error: "Roster record not found." },
        { status: 404 }
      );
    }

    const { data: operations } = await supabase
      .from("company_roster_operations_fact_v")
      .select("*")
      .eq("roster_id", rosterId)
      .maybeSingle();

    const profileId = roster.profile_id ?? null;

    let privateFact: any = null;
    let license: any = null;

    if (profileId) {
      const { data: privateRow } = await supabase
        .schema("core")
        .from("profile_private_fact")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle();

      privateFact = privateRow ?? null;

      const { data: licenseRows } = await supabase
        .schema("core")
        .from("profile_driver_license")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(1);

      license = licenseRows?.[0] ?? null;
    }

    return NextResponse.json(
      {
        roster: {
          roster_member_id: roster.id,
          company_id: roster.company_id,
          profile_id: roster.profile_id,
          person_id: roster.person_id,
          full_name: roster.full_name,
          email: roster.email,
          phone: roster.phone,
          worker_type: roster.worker_type,
          job_title: roster.job_title,
          employment_status: roster.employment_status,
          market_code: roster.market_code,
          reports_to_name: null,
          hire_date: roster.hire_date,
          separation_date: roster.separation_date,
          invite_status: roster.invite_status,
          compliance_summary: roster.compliance_summary,
          notes: roster.notes ?? null,

          scanner_serial: operations?.scanner_serial ?? null,
          fx_id: operations?.fx_id ?? null,
          dswid: operations?.dswid ?? null,
          dot_expiration_date: operations?.dot_exp ?? null,
          qual_cert_expiration_date: operations?.qual_cert_exp ?? null,
          daily_pay_effective_date:
            operations?.daily_pay_effective_date ?? null,
          daily_pay_rate: operations?.daily_pay_rate ?? null,
          fuel_card: operations?.fuel_card ?? null,
          pin_id_no: operations?.pin_id_no ?? null,

          date_of_birth: privateFact?.date_of_birth ?? null,
          address_line_1: privateFact?.address_line_1 ?? null,
          address_line_2: privateFact?.address_line_2 ?? null,
          city: privateFact?.city ?? null,
          state_region: privateFact?.state_region ?? null,
          postal_code: privateFact?.postal_code ?? null,

          license_number: license?.license_number ?? null,
          issuing_state: license?.issuing_state ?? null,
          license_issue_date: license?.issue_date ?? null,
          license_expiration_date: license?.expiration_date ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load roster record.";

    return NextResponse.json({ error: message }, { status: 500 });
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
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      phone?: unknown;
    };

    const email = normalizeNullableText(body.email)?.toLowerCase() ?? null;
    const phone = normalizeNullableText(body.phone);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: existing, error: existingError } = await supabase
      .schema("core")
      .from("company_roster")
      .select("id, company_id, full_name, email, phone")
      .eq("id", rosterId)
      .eq("company_id", company.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: "Roster record not found." },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .schema("core")
      .from("company_roster")
      .update({
        email,
        phone,
      })
      .eq("id", rosterId)
      .eq("company_id", company.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from("company_roster_event").insert({
      company_id: company.id,
      roster_id: rosterId,
      event_category: "identity",
      event_type: "contact_updated",
      event_detail: "Roster contact info updated from person detail.",
      event_metadata: {
        source: "person_detail_contact_editor",
        full_name: existing.full_name,
        before: {
          email: existing.email ?? null,
          phone: existing.phone ?? null,
        },
        after: {
          email,
          phone,
        },
      },
      occurred_at: new Date().toISOString(),
    });

    const { data: refreshed, error: refreshedError } = await supabase
      .from("company_roster_view")
      .select("*")
      .eq("company_id", company.id)
      .eq("roster_member_id", rosterId)
      .single();

    if (refreshedError || !refreshed) {
      return NextResponse.json(
        {
          ok: true,
          message:
            "Contact info updated, but refreshed roster view could not be loaded.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        roster: refreshed,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update roster contact info.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
