import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase
      .from("companies_with_industry")
      .select(
        [
          "id",
          "company_name",
          "company_slug",
          "company_status",
          "industry_label",
          "contact_email",
          "contact_phone",
          "website_url",
          "company_size_band",
          "created_at",
        ].join(", ")
      )
      .eq("company_slug", slug)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Company not found.", company: null },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { company: data },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load company.";

    return NextResponse.json(
      { error: message, company: null },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json();

    const {
      contact_email,
      contact_phone,
      website_url,
      company_size_band,
    } = body ?? {};

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: "You do not have permission to edit this company." },
        { status: 403 }
      );
    }

    if (!contact_email || typeof contact_email !== "string") {
      return NextResponse.json(
        { error: "Contact email is required." },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("companies")
      .update({
        contact_email: contact_email.trim(),
        contact_phone:
          typeof contact_phone === "string" && contact_phone.trim()
            ? contact_phone.trim()
            : null,
        website_url:
          typeof website_url === "string" && website_url.trim()
            ? website_url.trim()
            : null,
        company_size_band:
          typeof company_size_band === "string" && company_size_band.trim()
            ? company_size_band.trim()
            : null,
      })
      .eq("company_slug", slug)
      .select(
        [
          "id",
          "company_name",
          "company_slug",
          "company_status",
          "contact_email",
          "contact_phone",
          "website_url",
          "company_size_band",
          "created_at",
        ].join(", ")
      )
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? "Failed to update company." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { company: updated },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update company.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}