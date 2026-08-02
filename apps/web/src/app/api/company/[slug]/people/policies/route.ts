import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const policyId = request.nextUrl.searchParams.get("policyId");
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_policy_workspace", { p_company_slug: slug, p_policy_id: policyId || null });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const payload = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_company_policy", { p_company_slug: slug, p_policy_id: payload.id || null, p_title: payload.title, p_description: payload.description || null });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ id: data });
}

