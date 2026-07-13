import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type TemplateDocument = {
  id: string;
  document_key: string;
  title: string;
};

type TemplateVersion = {
  id: string;
  document_id: string;
  version_label: string;
  content_snapshot: {
    sections?: Array<{
      section_number?: number | null;
      section_key?: string | null;
      title?: string | null;
      summary?: string | null;
      body_markdown?: string | null;
    }>;
  } | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "customer";
}

const PLACEHOLDER_PATTERN = /\[[^\]\n]+\]/g;

function formatEffectiveDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function resolveClientText(
  value: string | null | undefined,
  fields: Map<string, string>
) {
  if (!value) return value ?? "";
  return value.replace(PLACEHOLDER_PATTERN, (token) => fields.get(token) || token);
}

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();
  const body = await req.json().catch(() => null);

  const templateDocumentId = cleanText(body?.templateDocumentId);
  const templateVersionId = cleanText(body?.templateVersionId);
  const customerLegalName = cleanText(body?.customerLegalName);
  const customerProjectLead = cleanText(body?.customerProjectLead);
  const teamOptixProjectLead = cleanText(body?.teamOptixProjectLead);
  const providerName = cleanText(body?.providerName) ?? "Team Optix, LLC";
  const effectiveAt = cleanDate(body?.effectiveDate);

  if (!templateDocumentId || !templateVersionId || !customerLegalName) {
    return NextResponse.json(
      { ok: false, error: "Template version and customer legal name are required." },
      { status: 400 }
    );
  }

  const { data: template, error: templateError } = await db
    .schema("legal")
    .from("document")
    .select("id, document_key, title, document_scope")
    .eq("id", templateDocumentId)
    .single();

  if (templateError) {
    return NextResponse.json({ ok: false, error: templateError.message }, { status: 500 });
  }

  if ((template as TemplateDocument & { document_scope?: string }).document_scope !== "TEMPLATE") {
    return NextResponse.json(
      { ok: false, error: "Client documents can only be created from locked templates." },
      { status: 400 }
    );
  }

  const { data: version, error: versionError } = await db
    .schema("legal")
    .from("document_version")
    .select("id, document_id, version_label, content_snapshot")
    .eq("id", templateVersionId)
    .eq("document_id", templateDocumentId)
    .eq("status", "LOCKED")
    .single();

  if (versionError) {
    return NextResponse.json({ ok: false, error: versionError.message }, { status: 500 });
  }

  const templateVersion = version as TemplateVersion;
  const sections = Array.isArray(templateVersion.content_snapshot?.sections)
    ? templateVersion.content_snapshot.sections
    : [];

  if (!sections.length) {
    return NextResponse.json(
      { ok: false, error: "The selected template version has no sections." },
      { status: 400 }
    );
  }

  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const clientDocumentKey = `${(template as TemplateDocument).document_key}__${slugPart(customerLegalName).toUpperCase()}__${suffix}`;

  const { data: clientDocument, error: insertDocumentError } = await db
    .schema("legal")
    .from("document")
    .insert({
      document_key: clientDocumentKey,
      title: `${customerLegalName} · ${(template as TemplateDocument).title}`,
      version_major: 1,
      version_minor: 0,
      version_patch: 0,
      current_version: "1.0.0",
      status: "DRAFT",
      owner_name: "Team Optix Business",
      document_scope: "CLIENT_DOCUMENT",
      source_template_document_id: templateDocumentId,
      source_template_version_id: templateVersionId,
      customer_legal_name: customerLegalName,
      customer_project_lead: customerProjectLead,
      teamoptix_project_lead: teamOptixProjectLead,
      provider_name: providerName,
      effective_at: effectiveAt,
      customer_document_label: `${customerLegalName} · ${(template as TemplateDocument).title}`,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertDocumentError) {
    return NextResponse.json({ ok: false, error: insertDocumentError.message }, { status: 500 });
  }

  const clientFields = new Map<string, string>([
    ["[Customer Legal Name]", customerLegalName],
    ["[Date]", formatEffectiveDate(effectiveAt)],
    ["[Customer Lead]", customerProjectLead ?? ""],
    ["[Team Optix Lead]", teamOptixProjectLead ?? ""],
  ]);

  const sectionPayload = sections.map((section, index) => ({
    document_id: clientDocument.id,
    section_number: section.section_number ?? index + 1,
    section_key: section.section_key || `section-${index + 1}`,
    title: resolveClientText(section.title ?? `Section ${index + 1}`, clientFields),
    summary: resolveClientText(section.summary ?? null, clientFields) || null,
    body_markdown: resolveClientText(section.body_markdown ?? "", clientFields),
    status: "DRAFT",
    workflow_status: "DRAFT",
  }));

  const { error: insertSectionsError } = await db
    .schema("legal")
    .from("document_section")
    .insert(sectionPayload);

  if (insertSectionsError) {
    await db.schema("legal").from("document").delete().eq("id", clientDocument.id);
    return NextResponse.json({ ok: false, error: insertSectionsError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    document: clientDocument,
    href: `/teamoptix/business/contracts/client-documents/${encodeURIComponent(clientDocument.document_key)}`,
  });
}
