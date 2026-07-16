import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deriveRosterComplianceSignals } from "@/features/compliance/lib/rosterCompliance";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { data: company } = await supabase.from("companies").select("id").eq("company_slug", slug).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  let query = supabase.from("company_roster_view").select("roster_member_id").eq("company_id", company.id);
  query = profile?.id ? query.eq("profile_id", profile.id) : query.eq("email", user.email ?? "");
  const { data: roster } = await query.maybeSingle();
  if (!roster) return NextResponse.json({ roster_member_id: null, compliance_signals: [] });

  const [licenseResult, operationsResult] = await Promise.all([
    supabase.from("company_roster_license_fact_v").select("expiration_date").eq("company_id", company.id).eq("roster_id", roster.roster_member_id).maybeSingle(),
    supabase.from("company_roster_operations_fact_v").select("dot_exp, qual_cert_exp").eq("company_id", company.id).eq("roster_id", roster.roster_member_id).maybeSingle(),
  ]);

  return NextResponse.json({
    roster_member_id: roster.roster_member_id,
    compliance_signals: deriveRosterComplianceSignals({
      licenseExpirationDate: licenseResult.data?.expiration_date ?? null,
      dotExpirationDate: operationsResult.data?.dot_exp ?? null,
      qualificationExpirationDate: operationsResult.data?.qual_cert_exp ?? null,
    }),
  });
}
