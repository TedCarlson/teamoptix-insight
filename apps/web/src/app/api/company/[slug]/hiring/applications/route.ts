import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("candidate_applications_v").select("*").eq("company_slug", slug).order("submitted_at", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ applications: data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await request.json();
  if (body.action !== "advance") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("advance_candidate_application_to_roster", { p_company_slug: slug, p_application_id: body.applicationId });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
