import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name, company_slug")
    .eq("company_slug", slug)
    .maybeSingle();
  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("company_operations_ticket_assignment_v")
    .select("*")
    .eq("company_id", company.id)
    .order("release_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ company, work_orders: data ?? [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await request.json();
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: access, error: accessError } = await supabase.rpc("access_context");
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: 400 });

  const { data: company } = await supabase.from("companies").select("id").eq("company_slug", slug).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const membership = Array.isArray(access?.memberships)
    ? access.memberships.find((item: any) => item.company_id === company.id)
    : null;
  const canEdit = Boolean(access?.is_platform_owner) || membership?.relationship_type === "admin";
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.rpc("update_company_operations_work_order_rule", {
    p_assignment_id: body.id,
    p_assignment_status: ["draft", "ready", "active", "paused", "retired"].includes(body.assignment_status) ? body.assignment_status : null,
    p_is_enabled: typeof body.is_enabled === "boolean" ? body.is_enabled : null,
    p_inactive_end_date: body.inactive_end_date || null,
    p_release_order: Number.isInteger(body.release_order) && body.release_order > 0 ? body.release_order : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
