import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const company = request.nextUrl.searchParams.get("company");
  const entry = request.nextUrl.searchParams.get("entry");
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("get_candidate_foyer_experience", {
    p_company_slug: company || null,
    p_entry_code: entry || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const companyId = typeof data === "object" && data && "company" in data
    ? (data.company as { id?: string } | null)?.id
    : null;
  const locations = new Set<string>();
  let bio: Record<string, unknown> | null = null;

  if (companyId) {
    const [{ data: roster }, { data: publishedBio }] = await Promise.all([
      service.from("company_roster_view").select("market_code").eq("company_id", companyId),
      service.from("company_candidate_bio_v").select("headline,summary,terminal_name,terminal_address,primary_work_area,work_description,candidate_note").eq("company_id", companyId).eq("is_published", true).maybeSingle(),
    ]);
    for (const row of roster ?? []) if (row.market_code) locations.add(row.market_code);
    bio = publishedBio ?? null;
  }

  const payload = {
    ...(data as Record<string, unknown>),
    options: {
      roles: [{ value: "Driver", label: "Driver" }, { value: "Helper", label: "Helper" }],
      locations: Array.from(locations).sort().map((value) => ({ value, label: value })),
    },
    bio,
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
