import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const db = createSupabaseServiceRoleClient();

/**
 * DOCUMENT
 */
export async function getDocument(documentKey: string) {
  const { data, error } = await db
    .from("legal_document_v")
    .select("*")
    .eq("document_key", documentKey)
    .single();

  if (error) throw error;
  return data;
}

/**
 * SECTIONS (NOW STABLE PUBLIC VIEW)
 */
export async function getSections(documentId: string) {
  const { data, error } = await db
    .from("legal_document_section_v")
    .select("*")
    .eq("document_id", documentId)
    .neq("status", "ARCHIVED")
    .order("section_number");

  if (error) throw error;
  return data ?? [];
}

/**
 * SINGLE SECTION
 */
export async function getSection(sectionId: string) {
  const { data, error } = await db
    .from("legal_document_section_v")
    .select("*")
    .eq("id", sectionId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * NOTES (UNCHANGED CORE ACCESS)
 */
export async function getNotes(sectionId: string) {
  const { data, error } = await db
    .from("document_section_note")
    .select("*")
    .eq("section_id", sectionId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * HISTORY
 */
export async function getHistory(sectionId: string) {
  const { data, error } = await db
    .from("document_section_revision")
    .select("*")
    .eq("section_id", sectionId)
    .order("revision_number", { ascending: false });

  if (error) throw error;
  return data ?? [];
}


/**
 * DOCUMENTS
 */
export async function getDocuments() {
  const { data, error } = await db
    .from("legal_document_v")
    .select("*")
    .order("title");

  if (error) throw error;
  return data ?? [];
}
