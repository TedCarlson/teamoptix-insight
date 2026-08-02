import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const payload = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("manage_company_policy_section", { p_company_slug: slug, p_policy_id: payload.policyId, p_section_id: payload.sectionId || null, p_action: payload.action, p_title: payload.title || null, p_body: payload.body ?? null });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}

