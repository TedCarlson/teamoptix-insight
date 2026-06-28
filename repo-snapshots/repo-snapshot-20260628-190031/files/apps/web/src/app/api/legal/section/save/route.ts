import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();

  const { sectionId, body } = await req.json();

  if (!sectionId || typeof body !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing sectionId or body." },
      { status: 400 }
    );
  }

  const { data, error } = await db.rpc("legal_update_document_section", {
    p_section_id: sectionId,
    p_body: body,
  });

  if (error || !data?.ok) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "RPC failed" },
      { status: 500 }
    );
  }

  // 🔥 SOURCE OF TRUTH REHYDRATION
  const { data: section, error: fetchError } = await db
    .from("legal_document_section_v")
    .select("*")
    .eq("id", sectionId)
    .single();

  if (fetchError) {
    return NextResponse.json(
      { ok: false, error: fetchError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    dbWritten: true,
    section,
  });
}
