import { NextResponse } from "next/server";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import type { NormalizedFuseOnboardingRow } from "@/features/insight-telecom/tools/fuseOnboardingImport";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CompareRequest = {
  action: "compare";
  source: {
    filename: string;
    sizeBytes: number;
    sha256: string;
    sheetName: string;
    headerRow: number;
  };
  rows: NormalizedFuseOnboardingRow[];
};

type ApplyRequest = {
  action: "apply";
  batchId: string;
  approvedRowIds: string[];
};

type AddCompanyRequest = {
  action: "add-company";
  batchId: string;
  sourceCompanyName: string;
  targetCompanyId?: string | null;
};

type IngestionRequest = CompareRequest | ApplyRequest | AddCompanyRequest;

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  const context = await resolveItfWorkspaceContext(slug);

  if (!context?.can_enter) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (!context.can_manage) {
    return NextResponse.json({ error: "Company management access is required." }, { status: 403 });
  }

  let body: IngestionRequest;
  try {
    body = (await request.json()) as IngestionRequest;
  } catch {
    return NextResponse.json({ error: "A valid ingestion request is required." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  if (body.action === "compare") {
    if (!body.source?.filename || !body.source.sha256 || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "Complete source metadata and rows are required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_stage_onboarding_import", {
      p_company_slug: context.company_slug,
      p_filename: body.source.filename,
      p_size_bytes: body.source.sizeBytes,
      p_sha256: body.source.sha256,
      p_sheet_name: body.source.sheetName,
      p_header_row: body.source.headerRow,
      p_rows: body.rows,
    });

    if (error) {
      console.error("Unable to compare ITF onboarding source", { companySlug: context.company_slug, error });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ result: data });
  }

  if (body.action === "apply") {
    if (!body.batchId || !Array.isArray(body.approvedRowIds)) {
      return NextResponse.json({ error: "A batch and approved rows are required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_apply_onboarding_import", {
      p_company_slug: context.company_slug,
      p_batch_id: body.batchId,
      p_approved_row_ids: body.approvedRowIds,
    });

    if (error) {
      console.error("Unable to apply ITF onboarding source", { companySlug: context.company_slug, error });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ result: data });
  }

  if (body.action === "add-company") {
    if (!body.batchId || !body.sourceCompanyName?.trim()) {
      return NextResponse.json({ error: "A batch and source company are required." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("itf_resolve_onboarding_company", {
      p_company_slug: context.company_slug,
      p_batch_id: body.batchId,
      p_source_company_name: body.sourceCompanyName,
      p_target_company_id: body.targetCompanyId ?? null,
    });

    if (error) {
      console.error("Unable to add ITF onboarding company", { companySlug: context.company_slug, error });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ result: data });
  }

  return NextResponse.json({ error: "A supported ingestion action is required." }, { status: 400 });
}
