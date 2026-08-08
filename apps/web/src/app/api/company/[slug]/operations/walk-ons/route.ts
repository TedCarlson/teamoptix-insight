import { NextRequest, NextResponse } from "next/server";
import { getDispatchRequestContext } from "@/features/dispatch/server/resolveDispatchCompany.server";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const [walkOns, units, assignments] = await Promise.all([
    ctx.supabase
      .from("company_walk_on_roster_v")
      .select("*")
      .eq("company_id", ctx.company.id)
      .order("full_name"),
    ctx.supabase
      .from("company_walk_on_workforce_unit_v")
      .select("*")
      .eq("company_id", ctx.company.id)
      .eq("status", "ACTIVE")
      .order("unit_name"),
    ctx.supabase
      .from("company_walk_on_assignment_v")
      .select("*")
      .eq("company_id", ctx.company.id)
      .order("service_date", { ascending: false })
      .limit(500),
  ]);

  const error = walkOns.error ?? units.error ?? assignments.error;
  if (error) {
    return NextResponse.json(
      { error: error.message, walk_ons: [], workforce_units: [], assignments: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({
    walk_ons: walkOns.data ?? [],
    workforce_units: units.data ?? [],
    assignments: assignments.data ?? [],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const fullName = text(body.full_name);
  const dswid = text(body.dswid);
  const serviceDate = text(body.service_date);
  const workforceUnitId = text(body.workforce_unit_id) || null;
  const newWorkforceUnitName = text(body.new_workforce_unit_name) || null;

  if (
    !fullName ||
    !dswid ||
    !isIsoDate(serviceDate) ||
    (!workforceUnitId && !newWorkforceUnitName)
  ) {
    return NextResponse.json(
      { error: "Name, DSWID, workforce unit, and valid service date are required." },
      { status: 400 }
    );
  }

  const { data, error } = await ctx.supabase.rpc(
    "upsert_company_walk_on_roster_member",
    {
      p_company_slug: slug,
      p_seen_date: serviceDate,
      p_roster_member_id: null,
      p_full_name: fullName,
      p_dswid: dswid,
      p_workforce_unit_id: workforceUnitId,
      p_new_workforce_unit_name: newWorkforceUnitName,
      p_note: text(body.note) || "Walk-on added from Operations management.",
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? { ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const rosterMemberId = text(body.roster_member_id);
  const fullName = text(body.full_name);
  const dswid = text(body.dswid);
  const workforceUnitId = text(body.workforce_unit_id);
  const status = text(body.status).toUpperCase();

  if (
    !rosterMemberId ||
    !fullName ||
    !dswid ||
    !workforceUnitId ||
    !["ACTIVE", "ARCHIVED"].includes(status)
  ) {
    return NextResponse.json(
      { error: "Walk-on, name, DSWID, workforce unit, and status are required." },
      { status: 400 }
    );
  }

  const { data, error } = await ctx.supabase.rpc(
    "manage_company_walk_on_roster_member",
    {
      p_company_slug: slug,
      p_roster_member_id: rosterMemberId,
      p_full_name: fullName,
      p_dswid: dswid,
      p_workforce_unit_id: workforceUnitId,
      p_status: status,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? { ok: true });
}
