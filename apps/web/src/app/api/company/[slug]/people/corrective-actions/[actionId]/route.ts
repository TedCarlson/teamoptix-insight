import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string; actionId: string }> }) {
  const { slug, actionId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_corrective_action", { p_company_slug: slug, p_action_id: actionId });
  return error || !data
    ? NextResponse.json({ error: error?.message || "Corrective action not found." }, { status: error ? 500 : 404 })
    : NextResponse.json(data);
}
