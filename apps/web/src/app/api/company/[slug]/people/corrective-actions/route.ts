import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_corrective_action_workspace", { p_company_slug: slug });
  return error
    ? NextResponse.json({ error: error.message }, { status: error.message.includes("access") ? 403 : 500 })
    : NextResponse.json(data, { status: 200 });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_company_corrective_action", {
    p_company_slug: slug,
    p_action_id: body.id || null,
    p_payload: body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (body.evidence_snapshot && data?.id) {
    const { error: evidenceError } = await supabase.rpc("save_company_corrective_action_evidence_snapshot", { p_company_slug: slug, p_action_id: data.id, p_evidence: body.evidence_snapshot });
    if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 200 });
}
