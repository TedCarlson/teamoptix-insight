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
    .select("id, document_key, title, version_major, version_minor, version_patch, current_version")
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

  const snapshot = {
    document: {
      id: legalDocument.id,
      document_key: legalDocument.document_key,
      title: legalDocument.title,
      version_label: label,
      version_major: legalDocument.version_major,
      version_minor: legalDocument.version_minor,
      version_patch: legalDocument.version_patch,
    },
    sections: sections.map((section) => ({
      id: section.id,
      section_number: section.section_number,
      section_key: section.section_key,
      title: section.title,
      summary: section.summary,
      body_markdown: section.body_markdown,
    })),
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
