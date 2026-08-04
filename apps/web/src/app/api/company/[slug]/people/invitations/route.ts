import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: company, error: companyError } = await supabase.from("companies").select("id").eq("company_slug", slug).single();
  if (companyError || !company) return NextResponse.json({ error: companyError?.message ?? "Company not found." }, { status: 400 });

  const [linksResult, rosterResult, requirementsResult] = await Promise.all([
    supabase.from("candidate_entry_links_v").select("*").eq("company_slug", slug).order("created_at", { ascending: false }),
    supabase.from("company_roster_view").select("market_code").eq("company_id", company.id),
    supabase.from("company_candidate_checklist_readiness_v").select("location_key,assignment_key").eq("company_id", company.id),
  ]);
  const error = linksResult.error || rosterResult.error || requirementsResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const locations = new Set<string>();
  const assignments = new Set<string>();
  for (const row of rosterResult.data ?? []) if (row.market_code) locations.add(row.market_code);
  for (const row of requirementsResult.data ?? []) {
    if (row.location_key) locations.add(row.location_key);
    if (row.assignment_key) assignments.add(row.assignment_key);
  }
  for (const row of linksResult.data ?? []) {
    if (row.location_key) locations.add(row.location_key);
    if (row.assignment_key) assignments.add(row.assignment_key);
  }

  return NextResponse.json({
    links: linksResult.data ?? [],
    options: {
      roles: [{ value: "Driver", label: "Driver" }, { value: "Helper", label: "Helper" }],
      locations: Array.from(locations).sort().map((value) => ({ value, label: value })),
      assignments: Array.from(assignments).sort().map((value) => ({ value, label: value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) })),
    },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_candidate_entry_link", {
    p_company_slug: slug,
    p_link_type: body.linkType,
    p_label: body.label || null,
    p_role_key: body.roleKey || null,
    p_location_key: body.locationKey || null,
    p_assignment_key: body.assignmentKey || null,
    p_scheduling_policy: body.schedulingPolicy || "required",
    p_bypass_reason: body.bypassReason || null,
    p_expires_at: body.expiresAt || null,
    p_max_uses: body.maxUses ? Number(body.maxUses) : null,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
