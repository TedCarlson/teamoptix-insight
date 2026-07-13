import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type LegalDocument = {
  id: string;
  document_key: string;
  title: string;
  version_major: number;
  version_minor: number;
  version_patch: number;
  current_version: string | null;
  effective_at: string | null;
  customer_legal_name: string | null;
  customer_project_lead: string | null;
  teamoptix_project_lead: string | null;
  provider_name: string | null;
  document_scope: string | null;
};

type LegalSection = {
  id: string;
  section_number: number;
  section_key: string;
  title: string;
  summary: string | null;
  body_markdown: string;
  status: string;
  workflow_status: string | null;
};

const PLACEHOLDER_PATTERN = /\[[^\]\n]+\]/g;

function isArchived(section: Pick<LegalSection, "status" | "workflow_status">) {
  return (
    section.status?.toUpperCase() === "ARCHIVED" ||
    section.workflow_status?.toUpperCase() === "ARCHIVED"
  );
}

function versionLabel(document: LegalDocument) {
  return (
    document.current_version ||
    `${document.version_major}.${document.version_minor}.${document.version_patch}`
  );
}

function formatEffectiveDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function mergeValues(document: LegalDocument) {
  return new Map<string, string>([
    ["[Customer Legal Name]", document.customer_legal_name?.trim() ?? ""],
    ["[Date]", formatEffectiveDate(document.effective_at)],
    ["[Customer Lead]", document.customer_project_lead?.trim() ?? ""],
    ["[Team Optix Lead]", document.teamoptix_project_lead?.trim() ?? ""],
  ]);
}

function unresolvedFields(sections: LegalSection[], values: Map<string, string>) {
  const unresolved = new Set<string>();

  for (const section of sections) {
    const text = `${section.title}\n${section.summary ?? ""}\n${section.body_markdown}`;
    const matches = text.match(PLACEHOLDER_PATTERN) ?? [];

    for (const match of matches) {
      if (!values.has(match) || !values.get(match)) {
        unresolved.add(match);
      }
    }
  }

  return Array.from(unresolved).sort();
}

function resolveText(value: string | null, values: Map<string, string>) {
  if (!value) return value ?? "";
  return value.replace(PLACEHOLDER_PATTERN, (token) => values.get(token) || token);
}

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();
  const body = await req.json().catch(() => null);
  const documentId = typeof body?.documentId === "string" ? body.documentId : "";

  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "Missing documentId" },
      { status: 400 }
    );
  }

  const { data: document, error: documentError } = await db
    .schema("legal")
    .from("document")
    .select(
      "id, document_key, title, version_major, version_minor, version_patch, current_version, effective_at, customer_legal_name, customer_project_lead, teamoptix_project_lead, provider_name, document_scope"
    )
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    return NextResponse.json(
      { ok: false, error: documentError?.message ?? "Document not found" },
      { status: 404 }
    );
  }

  const legalDocument = document as LegalDocument;
  const label = versionLabel(legalDocument);

  const { data: existing, error: existingError } = await db
    .schema("legal")
    .from("document_version")
    .select("*")
    .eq("document_id", documentId)
    .eq("version_label", label)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { ok: false, error: existingError.message },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json({ ok: true, alreadyLocked: true, version: existing });
  }

  const { data: sectionRows, error: sectionsError } = await db
    .schema("legal")
    .from("document_section")
    .select("id, section_number, section_key, title, summary, body_markdown, status, workflow_status")
    .eq("document_id", documentId)
    .order("section_number", { ascending: true });

  if (sectionsError) {
    return NextResponse.json(
      { ok: false, error: sectionsError.message },
      { status: 500 }
    );
  }

  const sections = ((sectionRows ?? []) as LegalSection[]).filter(
    (section) => !isArchived(section)
  );
  const isTemplate = legalDocument.document_scope === "TEMPLATE";
  const values = mergeValues(legalDocument);
  const unresolved = isTemplate ? [] : unresolvedFields(sections, values);

  if (unresolved.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Resolve document fields before locking this client document.",
        code: "UNRESOLVED_DOCUMENT_FIELDS",
        unresolvedFields: unresolved,
      },
      { status: 400 }
    );
  }

  const resolvedSections = sections.map((section) => ({
    id: section.id,
    section_number: section.section_number,
    section_key: section.section_key,
    title: isTemplate ? section.title : resolveText(section.title, values),
    summary: isTemplate ? section.summary ?? "" : resolveText(section.summary, values),
    body_markdown: isTemplate ? section.body_markdown : resolveText(section.body_markdown, values),
  }));

  const snapshot = {
    document: {
      id: legalDocument.id,
      document_key: legalDocument.document_key,
      title: legalDocument.title,
      version_label: label,
      version_major: legalDocument.version_major,
      version_minor: legalDocument.version_minor,
      version_patch: legalDocument.version_patch,
      effective_at: legalDocument.effective_at,
      customer_legal_name: legalDocument.customer_legal_name,
      customer_project_lead: legalDocument.customer_project_lead,
      teamoptix_project_lead: legalDocument.teamoptix_project_lead,
      provider_name: legalDocument.provider_name ?? "Team Optix, LLC",
      document_scope: legalDocument.document_scope ?? "TEMPLATE",
    },
    sections: resolvedSections,
  };

  const { data: version, error: insertError } = await db
    .schema("legal")
    .from("document_version")
    .insert({
      document_id: documentId,
      version_label: label,
      version_major: legalDocument.version_major,
      version_minor: legalDocument.version_minor,
      version_patch: legalDocument.version_patch,
      title: legalDocument.title,
      status: "LOCKED",
      section_count: sections.length,
      content_snapshot: snapshot,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, alreadyLocked: false, version });
}
