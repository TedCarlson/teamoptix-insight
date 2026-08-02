import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const payload = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_corrective_action_template", { p_company_slug: slug, p_payload: payload });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
