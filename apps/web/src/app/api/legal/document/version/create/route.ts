import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

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

  const { data, error } = await db.rpc("legal_lock_document_version", {
    p_document_id: documentId,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!data || data.ok === false) {
    return NextResponse.json(
      data ?? { ok: false, error: "Version lock failed." },
      { status: data?.code === "UNRESOLVED_DOCUMENT_FIELDS" ? 400 : 500 }
    );
  }

  return NextResponse.json(data);
}
