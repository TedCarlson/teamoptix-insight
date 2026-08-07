import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ slug: string }> };

async function companyForSlug(slug: string) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  const { data: company } = await supabase.from("companies").select("id").eq("company_slug", slug).single();
  if (!company) return { error: NextResponse.json({ error: "Company not found." }, { status: 404 }) };
  return { supabase, company };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const result = await companyForSlug(slug);
  if ("error" in result) return result.error;
  const serviceDate = req.nextUrl.searchParams.get("date") ?? "";
  const { supabase, company } = result;
  const serviceRole = createSupabaseServiceRoleClient();
  const { data: items, error } = await supabase
    .from("operations_watchlist_item_v")
    .select("*")
    .eq("company_id", company.id)
    .eq("service_date", serviceDate)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const itemIds = (items ?? []).map((item) => item.id);
  const { data: notes } = itemIds.length
    ? await supabase.from("operations_watchlist_note_v").select("*").in("watchlist_item_id", itemIds).order("created_at", { ascending: true })
    : { data: [] };
  const expressItems = (items ?? []).filter((item) =>
    item.signal_type === "EXPRESS_OPEN" || item.signal_type === "EXPRESS_ATTEMPTED"
  );
  const { data: expressEvidence, error: expressEvidenceError } = expressItems.length
    ? await serviceRole
        .from("operations_manifest_express_package_signal_v")
        .select("route_key, route_label, tracking_id, st_number, sid, signal_state")
        .eq("company_id", company.id)
        .eq("service_date", serviceDate)
        .order("route_key", { ascending: true })
        .order("st_number", { ascending: true })
    : { data: [], error: null };
  if (expressEvidenceError) return NextResponse.json({ error: expressEvidenceError.message }, { status: 500 });

  return NextResponse.json({
    items: (items ?? []).map((item) => ({
      ...item,
      notes: (notes ?? []).filter((note) => note.watchlist_item_id === item.id),
      evidence: item.signal_type.startsWith("EXPRESS_")
        ? {
            packages: (expressEvidence ?? []).filter((entry) =>
              entry.route_key === item.route_key
              && entry.signal_state === (item.signal_type === "EXPRESS_OPEN" ? "OPEN" : "CODED_ATTEMPT")
            ),
          }
        : { packages: [] },
    })),
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const result = await companyForSlug(slug);
  if ("error" in result) return result.error;
  const body = await req.json();
  const { error } = await result.supabase.rpc("update_company_operations_watchlist_item", {
    p_company_slug: slug,
    p_item_id: body.item_id,
    p_status: body.status,
    p_assigned_profile_id: null,
    p_due_at: body.due_at || null,
    p_resolution_class: body.resolution_class || null,
    p_client_visible: body.client_visible !== false,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const result = await companyForSlug(slug);
  if ("error" in result) return result.error;
  const body = await req.json();
  const { data, error } = await result.supabase.rpc("add_company_operations_watchlist_note", {
    p_company_slug: slug,
    p_item_id: body.item_id,
    p_note_type: body.note_type || "NOTE",
    p_body: body.body,
    p_client_visible: body.client_visible !== false,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true, id: data });
}
