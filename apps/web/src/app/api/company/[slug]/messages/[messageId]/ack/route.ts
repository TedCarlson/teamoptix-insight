import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; messageId: string }>;
};

type AccessMembership = {
  company_slug?: string | null;
};

type AccessContext = {
  profile_id?: string | null;
  memberships?: AccessMembership[] | null;
};

export async function POST(_req: Request, context: RouteContext) {
  const { slug, messageId } = await context.params;
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  const typedAccess = access as AccessContext | null;

  if (!typedAccess?.profile_id) {
    return NextResponse.json({ error: "Profile not found." }, { status: 403 });
  }

  const membership =
    typedAccess.memberships?.find((item) => item.company_slug === slug) ?? null;

  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("company_message_ack")
    .upsert(
      {
        company_id: company.id,
        message_id: messageId,
        profile_id: typedAccess.profile_id,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "message_id,profile_id" }
    )
    .select("id, message_id, company_id, profile_id, acknowledged_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ acknowledgment: data });
}
