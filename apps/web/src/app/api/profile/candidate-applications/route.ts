import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  await supabase.rpc("ensure_access_context");
  const { data: profile, error: profileError } = await supabase.rpc("current_profile").maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  const currentProfile = profile as { profile_id?: string | null } | null;
  if (!currentProfile?.profile_id) return NextResponse.json({ applications: [] });
  const { data, error } = await supabase.from("candidate_applications_v").select("id,company_name,company_slug,source_type,role_interest,location_interest,application_status,association_status,scheduling_policy,submitted_at").eq("profile_id", currentProfile.profile_id).order("submitted_at", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ applications: data ?? [] });
}
