import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string; actionId: string }> }) {
  const { slug, actionId } = await context.params;
  const payload = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_company_corrective_action_acknowledgment", {
    p_company_slug: slug,
    p_action_id: actionId,
    p_payload: payload,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
