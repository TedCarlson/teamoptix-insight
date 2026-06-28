import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(req: NextRequest) {
  const db = createSupabaseServiceRoleClient();

  const { sectionId, body } = await req.json();

  if (!sectionId || typeof body !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing sectionId or body" },
      { status: 400 }
    );
  }

  // 🔥 SINGLE SOURCE OF TRUTH WRITE
  const { data, error } = await db.rpc("legal_update_document_section", {
    p_section_id: sectionId,
    p_body: body,
  });

  if (error || !data?.ok) {
    return NextResponse.json(
      { ok: false, error: error?.message },
      { status: 500 }
    );
  }

  // 🔥 NO SCHEMA READ, NO VIEW READ — ONLY RPC CONFIRMATION
  return NextResponse.json({
    ok: true,
    dbWritten: true,
    sectionId: data.section_id,
    updatedAt: data.updated_at,
  });
}
