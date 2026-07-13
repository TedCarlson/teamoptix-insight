import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type LegalSection = {
  id: string;
  document_id: string;
  section_number: number;
  section_key: string;
  title: string;
  summary: string | null;
  body_markdown: string;
  section_version: number;
  status: string;
  created_at: string;
  updated_at: string;
  workflow_status: string | null;
  published_revision_id: string | null;
  current_revision_id: string | null;
};

function slugifyTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isArchived(section: Pick<LegalSection, "status" | "workflow_status">) {
  return (
    section.status?.toUpperCase() === "ARCHIVED" ||
    section.workflow_status?.toUpperCase() === "ARCHIVED"
  );
}

async function loadActiveSections(db: ReturnType<typeof createSupabaseServiceRoleClient>, documentId: string) {
  const { data, error } = await db
    .schema("legal")
    .from("document_section")
    .select("*")
    .eq("document_id", documentId)
    .order("section_number", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as LegalSection[]).filter((section) => !isArchived(section));
}

async function renumberSections(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  orderedSections: LegalSection[]
) {
  for (const [index, section] of orderedSections.entries()) {
    const { error } = await db
      .schema("legal")
      .from("document_section")
      .update({ section_number: -(index + 1), updated_at: new Date().toISOString() })
      .eq("id", section.id);

    if (error) throw error;
  }

  for (const [index, section] of orderedSections.entries()) {
    const { error } = await db
      .schema("legal")
      .from("document_section")
      .update({ section_number: index + 1, updated_at: new Date().toISOString() })
      .eq("id", section.id);

    if (error) throw error;
  }
}

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();
  const body = await req.json().catch(() => null);
  const action = body?.action;

  try {
    if (action === "add") {
      const documentId = typeof body?.documentId === "string" ? body.documentId : "";
      const title = typeof body?.title === "string" && body.title.trim()
        ? body.title.trim()
        : "New Section";

      if (!documentId) {
        return NextResponse.json(
          { ok: false, error: "Missing documentId" },
          { status: 400 }
        );
      }

      const sections = await loadActiveSections(db, documentId);
      const sectionNumber = sections.length + 1;
      const keyBase = slugifyTitle(title) || "section";
      const sectionKey = `${keyBase}-${Date.now().toString(36)}`;

      const { data, error } = await db
        .schema("legal")
        .from("document_section")
        .insert({
          document_id: documentId,
          section_number: sectionNumber,
          section_key: sectionKey,
          title,
          body_markdown: "",
          status: "DRAFT",
          workflow_status: "DRAFT",
        })
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({ ok: true, section: data });
    }

    if (action === "move") {
      const sectionId = typeof body?.sectionId === "string" ? body.sectionId : "";
      const direction = body?.direction === "up" ? "up" : body?.direction === "down" ? "down" : null;

      if (!sectionId || !direction) {
        return NextResponse.json(
          { ok: false, error: "Missing sectionId or direction" },
          { status: 400 }
        );
      }

      const { data: current, error: currentError } = await db
        .schema("legal")
        .from("document_section")
        .select("*")
        .eq("id", sectionId)
        .single();

      if (currentError) throw currentError;

      const sections = await loadActiveSections(db, (current as LegalSection).document_id);
      const currentIndex = sections.findIndex((section) => section.id === sectionId);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sections.length) {
        return NextResponse.json({ ok: true, sections });
      }

      const reordered = [...sections];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      await renumberSections(db, reordered);
      const nextSections = await loadActiveSections(db, (current as LegalSection).document_id);

      return NextResponse.json({ ok: true, sections: nextSections });
    }

    if (action === "archive") {
      const sectionId = typeof body?.sectionId === "string" ? body.sectionId : "";

      if (!sectionId) {
        return NextResponse.json(
          { ok: false, error: "Missing sectionId" },
          { status: 400 }
        );
      }

      const { data: current, error: currentError } = await db
        .schema("legal")
        .from("document_section")
        .select("*")
        .eq("id", sectionId)
        .single();

      if (currentError) throw currentError;

      const { error } = await db
        .schema("legal")
        .from("document_section")
        .update({
          status: "ARCHIVED",
          workflow_status: "ARCHIVED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sectionId);

      if (error) throw error;

      const sections = await loadActiveSections(db, (current as LegalSection).document_id);
      await renumberSections(db, sections);
      const nextSections = await loadActiveSections(db, (current as LegalSection).document_id);

      return NextResponse.json({ ok: true, sections: nextSections });
    }

    return NextResponse.json(
      { ok: false, error: "Unsupported section action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Section action failed",
      },
      { status: 500 }
    );
  }
}
