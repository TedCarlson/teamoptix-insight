import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await context.params;
  const { claimToken } = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in with the email used on your candidate submission." }, { status: 401 });
  await supabase.rpc("ensure_access_context");
  const { data, error } = await supabase.rpc("claim_candidate_foyer_application", { p_application_id: applicationId, p_claim_token: claimToken });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
