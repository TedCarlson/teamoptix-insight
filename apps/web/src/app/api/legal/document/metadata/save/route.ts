import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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

  const payload = {
    customer_legal_name: cleanText(body?.customerLegalName),
    customer_project_lead: cleanText(body?.customerProjectLead),
    teamoptix_project_lead: cleanText(body?.teamOptixProjectLead),
    provider_name: cleanText(body?.providerName) ?? "Team Optix, LLC",
    effective_at: cleanDate(body?.effectiveDate),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .schema("legal")
    .from("document")
    .update(payload)
    .eq("id", documentId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, document: data });
}
