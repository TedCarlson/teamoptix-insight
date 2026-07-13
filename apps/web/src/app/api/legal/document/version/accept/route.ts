import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const first = forwardedFor.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || null;
}

async function currentProfile() {
  try {
    const server = await getSupabaseServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();

    if (!user?.id) return null;

    const db = createSupabaseServiceRoleClient();
    const { data } = await db
      .schema("core")
      .from("profiles")
      .select("id, email, display_name, first_name, last_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    return (data as Profile | null) ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();
  const body = await req.json().catch(() => null);

  const documentVersionId = normalizedText(body?.documentVersionId);
  const acceptedByName = normalizedText(body?.acceptedByName);
  const acceptedByEmail = normalizeEmail(body?.acceptedByEmail);
  const acceptedByTitle = normalizedText(body?.acceptedByTitle) || null;
  const acceptedByCompany = normalizedText(body?.acceptedByCompany) || null;
  const companyId = normalizedText(body?.companyId) || null;
  const acknowledgmentChecked = body?.acknowledgmentChecked === true;

  if (!documentVersionId) {
    return NextResponse.json(
      { ok: false, error: "Missing documentVersionId" },
      { status: 400 }
    );
  }

  if (!acceptedByName || !acceptedByEmail || !acknowledgmentChecked) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Signer name, signer email, and electronic acknowledgment are required.",
      },
      { status: 400 }
    );
  }

  const profile = await currentProfile();

  const { data, error } = await db.rpc("legal_accept_document_version", {
    p_document_version_id: documentVersionId,
    p_accepted_by_name: acceptedByName,
    p_accepted_by_email: acceptedByEmail,
    p_accepted_by_title: acceptedByTitle,
    p_accepted_by_company: acceptedByCompany,
    p_company_id: companyId || null,
    p_accepted_by_profile_id: profile?.id ?? null,
    p_ip_address: clientIp(req),
    p_user_agent: req.headers.get("user-agent"),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data || data.ok === false) {
    return NextResponse.json(
      data ?? { ok: false, error: "Document acceptance failed." },
      { status: 400 }
    );
  }

  return NextResponse.json(data);
}
