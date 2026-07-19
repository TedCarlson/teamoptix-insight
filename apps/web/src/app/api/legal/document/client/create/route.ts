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

  const templateDocumentId = cleanText(body?.templateDocumentId);
  const templateVersionId = cleanText(body?.templateVersionId);
  const customerCompanyId = cleanText(body?.customerCompanyId);

  if (!templateDocumentId || !templateVersionId || !customerCompanyId) {
    return NextResponse.json(
      { ok: false, error: "Template version and customer company are required." },
      { status: 400 }
    );
  }

  const { data: customer, error: customerError } = await db
    .from("companies")
    .select("id,company_name,company_slug")
    .eq("id", customerCompanyId)
    .single();

  if (customerError || !customer?.company_name) {
    return NextResponse.json(
      { ok: false, error: "The selected customer company is not available." },
      { status: 400 }
    );
  }

  const { data, error } = await db.rpc("legal_create_client_document", {
    p_template_document_id: templateDocumentId,
    p_template_version_id: templateVersionId,
    p_customer_legal_name: customer.company_name,
    p_effective_at: cleanDate(body?.effectiveDate),
    p_customer_project_lead: cleanText(body?.customerProjectLead),
    p_teamoptix_project_lead: cleanText(body?.teamOptixProjectLead),
    p_provider_name: cleanText(body?.providerName) ?? "Team Optix, LLC",
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!data || data.ok === false) {
    return NextResponse.json(
      data ?? { ok: false, error: "Client document creation failed." },
      { status: 400 }
    );
  }

  const documentId = cleanText(data?.document?.id);
  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "The client document was created without an authoritative document identity." },
      { status: 500 }
    );
  }

  const { error: linkError } = await db.rpc("legal_link_client_document_company", {
    p_document_id: documentId,
    p_customer_company_id: customer.id,
  });

  if (linkError) {
    return NextResponse.json(
      { ok: false, error: `Client document company linkage failed: ${linkError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...data,
    customer: {
      id: customer.id,
      companyName: customer.company_name,
      companySlug: customer.company_slug,
    },
  });
}
