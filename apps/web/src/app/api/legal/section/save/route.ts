import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();

  const { sectionId, body, title } = await req.json();

  if (!sectionId || typeof body !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing sectionId or body" },
      { status: 400 }
    );
  }

  // Keep the existing single source of truth write for body/revision handling.
  const { data, error } = await db.rpc("legal_update_document_section", {
    p_section_id: sectionId,
    p_body: body,
  });

  if (error || !data?.ok) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Section save failed" },
      { status: 500 }
    );
  }

  let savedTitle = typeof title === "string" ? title.trim() : "";

  if (savedTitle) {
    const { error: titleError } = await db
      .schema("legal")
      .from("document_section")
      .update({
        title: savedTitle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sectionId);

    if (titleError) {
      return NextResponse.json(
        { ok: false, error: titleError.message },
        { status: 500 }
      );
    }
  }

  const { data: section, error: sectionError } = await db
    .schema("legal")
    .from("document_section")
    .select("*")
    .eq("id", sectionId)
    .single();

  if (sectionError) {
    return NextResponse.json(
      { ok: false, error: sectionError.message },
      { status: 500 }
    );
  }


  return NextResponse.json({
    ok: true,
    dbWritten: true,
    sectionId: data.section_id,
    updatedAt: data.updated_at,
    section,
  });
}
