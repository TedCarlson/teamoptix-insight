import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type LegalDocumentVersion = {
  id: string;
  document_id: string;
  version_label: string;
  status: string;
  title?: string | null;
  content_snapshot: unknown;
};

type LegalDocument = {
  id: string;
  document_key: string;
};

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


async function upsertVaultItem({
  db,
  acceptance,
  version,
}: {
  db: ReturnType<typeof createSupabaseServiceRoleClient>;
  acceptance: Record<string, unknown>;
  version: LegalDocumentVersion;
}) {
  const documentId = typeof acceptance.document_id === "string" ? acceptance.document_id : version.document_id;

  const { data: document } = await db
    .schema("legal")
    .from("document")
    .select("id, document_key")
    .eq("id", documentId)
    .maybeSingle();

  const legalDocument = document as LegalDocument | null;

  const { error } = await db
    .schema("legal")
    .from("document_vault_item")
    .upsert(
      {
        document_id: documentId,
        document_version_id: version.id,
        acceptance_id: acceptance.id,
        company_id: acceptance.company_id ?? null,
        document_type: legalDocument?.document_key ?? "UNKNOWN_DOCUMENT",
        document_title: version.title ?? "Document",
        version_label: version.version_label,
        artifact_type: "ACCEPTANCE_RECORD",
        artifact_status: "STORED",
        storage_status: "METADATA_ONLY",
        content_snapshot: acceptance.content_snapshot ?? version.content_snapshot ?? {},
        accepted_by_name: acceptance.accepted_by_name ?? null,
        accepted_by_email: acceptance.accepted_by_email ?? null,
        accepted_by_title: acceptance.accepted_by_title ?? null,
        accepted_by_company: acceptance.accepted_by_company ?? null,
        accepted_at: acceptance.accepted_at ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "acceptance_id" }
    );

  if (error) throw error;
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
        error: "Signer name, signer email, and electronic acknowledgment are required.",
      },
      { status: 400 }
    );
  }

  const { data: versionRow, error: versionError } = await db
    .schema("legal")
    .from("document_version")
    .select("id, document_id, version_label, status, title, content_snapshot")
    .eq("id", documentVersionId)
    .single();

  if (versionError || !versionRow) {
    return NextResponse.json(
      { ok: false, error: versionError?.message ?? "Locked version not found" },
      { status: 404 }
    );
  }

  const version = versionRow as LegalDocumentVersion;
  if (version.status !== "LOCKED") {
    return NextResponse.json(
      { ok: false, error: "Only locked document versions can be accepted." },
      { status: 409 }
    );
  }

  const { data: existing, error: existingError } = await db
    .schema("legal")
    .from("document_version_acceptance")
    .select("*")
    .eq("document_version_id", documentVersionId)
    .eq("accepted_by_email", acceptedByEmail)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { ok: false, error: existingError.message },
      { status: 500 }
    );
  }

  if (existing) {
    try {
      await upsertVaultItem({ db, acceptance: existing, version });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Vault artifact creation failed",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, alreadyAccepted: true, acceptance: existing });
  }

  const profile = await currentProfile();

  const { data: acceptance, error: insertError } = await db
    .schema("legal")
    .from("document_version_acceptance")
    .insert({
      document_version_id: documentVersionId,
      document_id: version.document_id,
      company_id: companyId,
      accepted_by_profile_id: profile?.id ?? null,
      accepted_by_name: acceptedByName,
      accepted_by_email: acceptedByEmail,
      accepted_by_title: acceptedByTitle,
      accepted_by_company: acceptedByCompany,
      acceptance_method: "READ_AND_ACCEPT",
      acknowledgment_checked: true,
      content_snapshot: version.content_snapshot ?? {},
      ip_address: clientIp(req),
      user_agent: req.headers.get("user-agent"),
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message },
      { status: 500 }
    );
  }

  try {
    await upsertVaultItem({ db, acceptance, version });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Vault artifact creation failed",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, alreadyAccepted: false, acceptance });
}
