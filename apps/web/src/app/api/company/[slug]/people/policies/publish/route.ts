import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { policyId } = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_company_policy", { p_company_slug: slug, p_policy_id: policyId });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ versionId: data });
}

