import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const db = createSupabaseServiceRoleClient();

export async function getDocument(documentKey:string){

  const {data,error}=await db
    .from("legal_document_v")
    .select("*")
    .eq("document_key",documentKey)
    .single();

  if(error) throw error;

  return data;

}

export async function getSections(documentId:string){

  const {data,error}=await db
    .from("legal_document_section_v")
    .select("*")
    .eq("document_id",documentId)
    .order("section_number");

  if(error) throw error;

  return data ?? [];

}

export async function getSection(sectionId:string){

  const {data,error}=await db
    .from("legal_document_section_v")
    .select("*")
    .eq("id",sectionId)
    .single();

  if(error) throw error;

  return data;

}

export async function getNotes(sectionId:string){

  const {data,error}=await db
    .schema("legal")
    .from("document_section_note")
    .select("*")
    .eq("section_id",sectionId)
    .order("created_at",{ascending:false});

  if(error) throw error;

  return data ?? [];

}

export async function getHistory(sectionId:string){

  const {data,error}=await db
    .schema("legal")
    .from("document_section_revision")
    .select("*")
    .eq("section_id",sectionId)
    .order("revision_number",{ascending:false});

  if(error) throw error;

  return data ?? [];

}
