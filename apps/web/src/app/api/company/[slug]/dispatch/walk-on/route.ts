import { NextRequest, NextResponse } from "next/server";
import { getDispatchRequestContext } from "@/features/dispatch/server/resolveDispatchCompany.server";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const ctx = await getDispatchRequestContext(slug);

  if ("error" in ctx) return ctx.error;

  const [walkOnsResult, unitsResult] = await Promise.all([
    ctx.supabase
      .from("company_walk_on_roster_v")
      .select("*")
      .eq("company_id", ctx.company.id)
      .eq("status", "ACTIVE")
      .order("full_name"),
    ctx.supabase
      .from("company_walk_on_workforce_unit_v")
      .select("*")
      .eq("company_id", ctx.company.id)
      .eq("status", "ACTIVE")
      .order("unit_name"),
  ]);

  const error = walkOnsResult.error ?? unitsResult.error;
  if (error) {
    return NextResponse.json(
      { error: error.message, walk_ons: [], workforce_units: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({
    walk_ons: walkOnsResult.data ?? [],
    workforce_units: unitsResult.data ?? [],
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = await req.json().catch(() => ({}));
  const ctx = await getDispatchRequestContext(slug);

  if ("error" in ctx) return ctx.error;

  const recordMode = text(body.record_mode).toUpperCase() || "WALK_ON";
  const fullName = text(body.full_name);
  const rosterMemberId = text(body.roster_member_id) || null;
  const dswid = text(body.dswid) || null;
  const workforceUnitId = text(body.workforce_unit_id) || null;
  const newWorkforceUnitName = text(body.new_workforce_unit_name) || null;

  if (recordMode === "CANDIDATE" && !fullName) {
    return NextResponse.json(
      { error: "Candidate name is required." },
      { status: 400 }
    );
  }

  if (recordMode === "WALK_ON" && !rosterMemberId && (!fullName || !dswid)) {
    return NextResponse.json(
      { error: "A new walk-on requires full name and DSWID." },
      { status: 400 }
    );
  }

  if (
    recordMode === "WALK_ON" &&
    !workforceUnitId &&
    !newWorkforceUnitName
  ) {
    return NextResponse.json(
      { error: "A lending workforce unit is required." },
      { status: 400 }
    );
  }

  if (!["CANDIDATE", "WALK_ON"].includes(recordMode)) {
    return NextResponse.json(
      { error: "Record mode must be CANDIDATE or WALK_ON." },
      { status: 400 }
    );
  }

  const seenDate =
    typeof body.seen_date === "string" && body.seen_date.trim()
      ? body.seen_date.trim()
      : new Date().toISOString().slice(0, 10);

  const rpc =
    recordMode === "CANDIDATE"
      ? ctx.supabase.rpc("create_walk_on_roster_candidate", {
          p_company_slug: slug,
          p_full_name: fullName,
          p_seen_date: seenDate,
          p_note: "Candidate created from the Dispatch walk-on action.",
        })
      : ctx.supabase.rpc("upsert_company_walk_on_roster_member", {
          p_company_slug: slug,
          p_seen_date: seenDate,
          p_roster_member_id: rosterMemberId,
          p_full_name: fullName || null,
          p_dswid: dswid,
          p_workforce_unit_id: workforceUnitId,
          p_new_workforce_unit_name: newWorkforceUnitName,
          p_note: text(body.note) || "Walk-on driver added from Dispatch.",
        });

  const { data, error } = await rpc;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { ok: true });
}
