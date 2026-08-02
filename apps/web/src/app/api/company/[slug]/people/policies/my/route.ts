import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_company_policy_tasks", { p_company_slug: slug });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const payload = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("respond_to_company_policy", { p_company_slug: slug, p_assignment_id: payload.assignmentId, p_response: payload.response, p_comment: payload.comment || null, p_user_agent: request.headers.get("user-agent") });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}

