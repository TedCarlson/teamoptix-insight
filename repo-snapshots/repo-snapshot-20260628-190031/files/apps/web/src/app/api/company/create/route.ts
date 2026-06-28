// apps/web/src/app/api/company/create/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const body = await req.json();

    const {
      company_name,
      company_slug,
      primary_industry,
      contact_email,
      contact_phone,
      website_url,
      company_size_band,
    } = body;

    if (!company_name || !company_slug) {
      return NextResponse.json(
        { error: "Company name and slug required." },
        { status: 400 }
      );
    }

    // ensure authenticated
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // load access context
    const { data: access, error: accessError } =
      await supabase.rpc("access_context");

    if (accessError || !access) {
      return NextResponse.json(
        { error: "Access context unavailable." },
        { status: 500 }
      );
    }

    if (!access.is_platform_owner) {
      return NextResponse.json(
        { error: "Company creation restricted." },
        { status: 403 }
      );
    }

    // create company (public schema)
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        company_name,
        company_slug,
        primary_industry_id: primary_industry,
        contact_email,
        contact_phone,
        website_url,
        company_size_band,
        company_status: "active",
      })
      .select("id, company_slug")
      .single();

    if (companyError) {
      return NextResponse.json(
        { error: companyError.message },
        { status: 400 }
      );
    }

    // create membership
    const { error: membershipError } = await supabase
      .from("company_memberships")
      .insert({
        company_id: company.id,
        profile_id: access.profile_id,
        relationship_type: "admin",
        membership_status: "active",
        title: "Owner",
      });

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      company_slug: company.company_slug,
    });

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Unexpected error creating company." },
      { status: 500 }
    );
  }
}