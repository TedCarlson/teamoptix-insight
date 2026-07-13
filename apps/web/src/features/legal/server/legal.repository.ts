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

export async function getTemplateDocuments() {
  const { data, error } = await db
    .from("legal_document_v")
    .select("*")
    .eq("document_scope", "TEMPLATE")
    .order("title");

  if (error) throw error;
  return data ?? [];
}

export async function getClientDocuments() {
  const { data, error } = await db
    .from("legal_document_v")
    .select("*")
    .eq("document_scope", "CLIENT_DOCUMENT")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * LOCKED DOCUMENT VERSIONS
 */
export async function getDocumentVersions(documentId: string) {
  const { data, error } = await db
    .from("legal_document_version_v")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}


/**
 * DOCUMENT VERSION ACCEPTANCES
 */
export async function getDocumentVersionAcceptances(documentId: string) {
  const { data, error } = await db
    .from("legal_document_version_acceptance_v")
    .select("*")
    .eq("document_id", documentId)
    .order("accepted_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * COMPLIANCE VAULT
 */
export async function getDocumentVaultItems() {
  const { data, error } = await db
    .from("legal_document_vault_item_v")
    .select("*")
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDocumentVaultItem(vaultItemId: string) {
  const { data, error } = await db
    .from("legal_document_vault_item_v")
    .select("*")
    .eq("id", vaultItemId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * CUSTOMER LEGAL TASKS
 */
export async function getCustomerLegalTasks() {
  const { data, error } = await db
    .from("legal_customer_legal_task_v")
    .select("*")
    .order("released_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Legal task queue unavailable", error);
    return [];
  }

  return data ?? [];
}

export async function getCustomerLegalTasksForCompanySlug(slug: string) {
  const { data, error } = await db
    .from("legal_customer_legal_task_v")
    .select("*")
    .eq("company_slug", slug)
    .order("released_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Company legal task queue unavailable", error);
    return [];
  }

  return data ?? [];
}

export async function getDocumentVersionsByIds(versionIds: string[]) {
  const ids = Array.from(new Set(versionIds.filter(Boolean)));

  if (!ids.length) return [];

  const { data, error } = await db
    .from("legal_document_version_v")
    .select("*")
    .in("id", ids);

  if (error) {
    console.warn("Locked legal versions unavailable", error);
    return [];
  }

  return data ?? [];
}
