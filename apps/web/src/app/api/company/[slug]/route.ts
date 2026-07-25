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

    let { data, error } = await supabase
      .from("companies_with_industry")
      .select(
        [
          "id",
          "company_name",
          "company_slug",
          "company_status",
          "industry_label",
          "authorized_operator_name",
          "contact_email",
          "contact_phone",
          "website_url",
          "company_size_band",
          "created_at",
        ].join(", ")
      )
      .eq("company_slug", slug)
      .single();

    if (error && error.message.includes("authorized_operator_name")) {
      const fallback = await supabase
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

      data = fallback.data
        ? Object.assign({}, fallback.data, { authorized_operator_name: null })
        : null;
      error = fallback.error;
    }

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
      authorized_operator_name,
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

    if (!authorized_operator_name || typeof authorized_operator_name !== "string") {
      return NextResponse.json(
        { error: "Authorized Operator full name is required." },
        { status: 400 }
      );
    }

    const { data: result, error: updateError } = await supabase.rpc(
      "update_company_profile",
      {
        p_company_slug: slug,
        p_authorized_operator_name: authorized_operator_name,
        p_contact_email: contact_email,
        p_contact_phone: typeof contact_phone === "string" ? contact_phone : "",
        p_website_url: typeof website_url === "string" ? website_url : "",
        p_company_size_band: typeof company_size_band === "string" ? company_size_band : "",
      }
    );

    if (updateError || result?.error || !result?.company) {
      return NextResponse.json(
        { error: updateError?.message ?? result?.error ?? "Failed to update company." },
        { status: result?.error === "Forbidden." ? 403 : 400 }
      );
    }

    return NextResponse.json(
      { company: result.company },
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
