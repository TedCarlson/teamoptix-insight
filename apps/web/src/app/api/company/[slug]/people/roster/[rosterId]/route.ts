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
      .from("company_roster_view")
      .select("*")
      .eq("company_id", company.id)
      .eq("roster_member_id", rosterId)
      .single();

    if (rosterError || !roster) {
      return NextResponse.json(
        { error: "Roster record not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ roster }, { status: 200 });
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
          message: "Contact info updated, but refreshed roster view could not be loaded.",
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
      error instanceof Error ? error.message : "Failed to update roster contact info.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
