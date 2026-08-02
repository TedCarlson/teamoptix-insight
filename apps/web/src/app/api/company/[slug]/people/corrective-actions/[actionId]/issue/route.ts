import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest, context: { params: Promise<{ slug: string; actionId: string }> }) {
  const { slug, actionId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("issue_company_corrective_action", { p_company_slug: slug, p_action_id: actionId });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
