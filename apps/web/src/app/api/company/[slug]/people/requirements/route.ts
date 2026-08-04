import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();

  const { data: company, error: companyError } = await supabase
    .from("companies_with_industry")
    .select("id, primary_industry_id, industry_label")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json(
      { error: companyError?.message ?? "Company not found." },
      { status: 400 },
    );
  }

  const [requirementsResult, rosterResult, linksResult, bioResult] = await Promise.all([
    supabase
      .from("company_candidate_checklist_readiness_v")
      .select("*")
      .eq("company_id", company.id)
      .order("sort_order", { ascending: true })
      .order("display_label", { ascending: true }),
    supabase
      .from("company_roster_view")
      .select("market_code")
      .eq("company_id", company.id),
    supabase
      .from("candidate_entry_links_v")
      .select("location_key, assignment_key")
      .eq("company_id", company.id),
    supabase.rpc("get_company_candidate_bio_admin", { p_company_slug: slug }),
  ]);

  // Company Bio is helpful context, but it must not take the readiness
  // workbench offline while PostgREST refreshes a newly added RPC.
  const error = requirementsResult.error || rosterResult.error || linksResult.error;
  const requirements = requirementsResult.data ?? [];
  const locationValues = new Set<string>();
  const assignmentValues = new Set<string>();

  for (const row of rosterResult.data ?? []) {
    if (row.market_code) locationValues.add(row.market_code);
  }
  for (const row of linksResult.data ?? []) {
    if (row.location_key) locationValues.add(row.location_key);
    if (row.assignment_key) assignmentValues.add(row.assignment_key);
  }
  for (const row of requirements) {
    if (row.location_key) locationValues.add(row.location_key);
    if (row.assignment_key) assignmentValues.add(row.assignment_key);
  }

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({
        requirements,
        industry: {
          id: company.primary_industry_id ?? null,
          label: company.industry_label ?? null,
        },
        options: {
          roles: [
            { value: "Driver", label: "Driver" },
            { value: "Helper", label: "Helper" },
          ],
          locations: Array.from(locationValues).sort().map((value) => ({ value, label: value })),
          assignments: Array.from(assignmentValues).sort().map((value) => ({
            value,
            label: value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
          })),
        },
        bio: bioResult.error ? null : (bioResult.data ?? null),
      });
}

export async function POST(request: NextRequest, context: Context) {
  const { slug } = await context.params;
  const body = await request.json();
  const supabase = await getSupabaseServerClient();

  if (body.action === "apply_industry_baseline") {
    const { data, error } = await supabase.rpc(
      "apply_company_candidate_industry_baseline",
      { p_company_slug: slug },
    );

    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json(data);
  }

  if (body.action === "save_company_bio") {
    const { data, error } = await supabase.rpc("upsert_company_candidate_bio", {
      p_company_slug: slug,
      p_headline: body.headline || null,
      p_summary: body.summary || null,
      p_terminal_name: body.terminalName || null,
      p_terminal_address: body.terminalAddress || null,
      p_primary_work_area: body.primaryWorkArea || null,
      p_work_description: body.workDescription || null,
      p_candidate_note: body.candidateNote || null,
      p_is_published: body.isPublished === true,
    });

    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json(data);
  }

  const { data, error } = await supabase.rpc(
    "upsert_company_candidate_readiness_requirement",
    {
      p_company_slug: slug,
      p_item_key: body.itemKey,
      p_label: body.label,
      p_description: body.description || null,
      p_category: body.category || "Readiness",
      p_phase: body.phase || "finalist",
      p_evidence_type: body.evidenceType || null,
      p_role_key: body.roleKey || null,
      p_location_key: body.locationKey || null,
      p_assignment_key: body.assignmentKey || null,
      p_is_required: body.isRequired !== false,
      p_is_blocking: body.isBlocking !== false,
      p_is_enabled: body.isEnabled !== false,
      p_expose_in_foyer: body.exposeInFoyer !== false,
      p_readiness_weight: Number(body.readinessWeight ?? 1),
      p_sort_order: Number(body.sortOrder ?? 100),
      p_source_scope: body.sourceScope || "company",
    },
  );

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json(data);
}
