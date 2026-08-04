import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET() {
  const service = createSupabaseServiceRoleClient();
  const [{ data: bios, error }, { data: publicLinks, error: linksError }] = await Promise.all([
    service
      .from("company_candidate_bio_v")
      .select("company_id,headline,summary,terminal_name,terminal_address,primary_work_area,work_description,candidate_note")
      .eq("is_published", true),
    service
      .from("candidate_entry_links_v")
      .select("company_id")
      .eq("link_type", "company_general")
      .eq("status", "active"),
  ]);

  if (error || linksError) return NextResponse.json({ error: error?.message ?? linksError?.message, companies: [] }, { status: 400 });

  const companyIds = Array.from(new Set([
    ...(bios ?? []).map((bio) => bio.company_id),
    ...(publicLinks ?? []).map((link) => link.company_id),
  ]));
  const { data: companies, error: companyError } = companyIds.length
    ? await service
        .from("companies_with_industry")
        .select("id,company_name,company_slug,company_status,logo_url,industry_label")
        .in("id", companyIds)
        .eq("company_status", "active")
        .order("company_name")
    : { data: [], error: null };

  if (companyError) return NextResponse.json({ error: companyError.message, companies: [] }, { status: 400 });

  const bioByCompanyId = new Map((bios ?? []).map((bio) => [bio.company_id, bio]));
  return NextResponse.json({
    companies: (companies ?? []).map((company) => ({
      company_id: company.id,
      company_name: company.company_name,
      company_slug: company.company_slug,
      logo_url: company.logo_url,
      industry_label: company.industry_label,
      ...(bioByCompanyId.get(company.id) ?? {}),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
