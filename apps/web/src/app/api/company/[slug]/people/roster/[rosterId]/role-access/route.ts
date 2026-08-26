import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function withAssetGrant(context: any, assetData: any) {
  const assetProfiles = new Set(
    Array.isArray(assetData?.profile_ids) ? assetData.profile_ids : [],
  );
  if (!context?.profile_id || !assetProfiles.has(context.profile_id)) return context;
  return {
    ...context,
    grants: Array.from(new Set([...(Array.isArray(context.grants) ? context.grants : []), "assets"])),
  };
}

function errorStatus(message: string) {
  if (message === "Forbidden.") return 403;
  if (message === "Company not found." || message === "Roster member not found.") return 404;
  return 400;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> },
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const [{ data, error }, { data: assetData, error: assetError }] = await Promise.all([
      supabase.rpc("get_company_person_role_context", {
        p_company_slug: slug,
        p_roster_member_id: rosterId,
      }),
      supabase.rpc("get_company_asset_grants", { p_company_slug: slug }),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
    if (assetError || assetData?.error) return NextResponse.json({ error: assetError?.message ?? assetData?.error }, { status: 500 });
    return NextResponse.json(withAssetGrant(data, assetData), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load role and access." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> },
) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const roleLabel = typeof body.role_label === "string" ? body.role_label.trim() : "";
    const leadershipRoleKey = body.leadership_role_key === null
      ? null
      : typeof body.leadership_role_key === "string"
        ? body.leadership_role_key
        : undefined;
    const grants = Array.isArray(body.grants)
      ? body.grants.filter((grant: unknown): grant is string => typeof grant === "string")
      : null;

    if (!roleLabel || leadershipRoleKey === undefined || !grants) {
      return NextResponse.json(
        { error: "role_label, leadership_role_key, and grants are required." },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();
    const wantsAssets = grants.includes("assets");
    const { data, error } = await supabase.rpc("apply_company_person_role_change", {
      p_company_slug: slug,
      p_roster_member_id: rosterId,
      p_role_label: roleLabel,
      p_leadership_role_key: leadershipRoleKey,
      p_grant_keys: grants.filter((grant: string) => grant !== "assets"),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.error) return NextResponse.json({ error: data.error }, { status: errorStatus(data.error) });
    const { data: assetData, error: assetError } = await supabase.rpc(
      "update_company_profile_asset_grant",
      { p_company_slug: slug, p_profile_id: data.profile_id, p_is_active: wantsAssets },
    );
    if (assetError || assetData?.error) return NextResponse.json({ error: assetError?.message ?? assetData?.error }, { status: 500 });
    return NextResponse.json({ ok: true, context: withAssetGrant(data, assetData) }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update role and access." },
      { status: 500 },
    );
  }
}
