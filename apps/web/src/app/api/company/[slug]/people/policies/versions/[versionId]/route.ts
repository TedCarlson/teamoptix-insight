import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ slug: string; versionId: string }> }) {
  const { slug, versionId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_policy_version", { p_company_slug: slug, p_version_id: versionId });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}

