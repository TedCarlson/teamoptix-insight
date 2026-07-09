import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const admin = createSupabaseServiceRoleClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data, error } = await admin
    .schema("commercial")
    .from("profile")
    .select("*")
    .eq("company_id", company.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data ?? null });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const admin = createSupabaseServiceRoleClient();

  const body = await req.json();

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
      { error: "Forbidden." },
      { status: 403 }
    );
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const payload = {
    company_id: company.id,
    operator_tier_key: body.operator_tier_key ?? null,
    implementation_fee: body.implementation_fee ?? null,
    weekly_subscription: body.weekly_subscription ?? null,
    billing_contact_name: body.billing_contact_name ?? null,
    billing_email: body.billing_email ?? null,
    billing_phone: body.billing_phone ?? null,
    commercial_status: body.commercial_status ?? "draft",
  };

  const { data, error } = await admin
    .schema("commercial")
    .from("profile")
    .upsert(payload, { onConflict: "company_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data });
}
