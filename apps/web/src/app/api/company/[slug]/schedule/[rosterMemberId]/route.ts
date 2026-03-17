import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterMemberId: string }>;
};

type BaselinePayload = {
  preset_id?: string | null;
  rotation_mode?: string | null;
  effective_start?: string | null;
  default_route_s?: string | null;
  default_route_u?: string | null;
  default_route_m?: string | null;
  default_route_t?: string | null;
  default_route_w?: string | null;
  default_route_h?: string | null;
  default_route_f?: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterMemberId } = await context.params;
    const sb = await getSupabaseServerClient();

    const body = (await req.json()) as BaselinePayload;

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", detail: companyErr },
        { status: 404 }
      );
    }

    const { data: existing, error: existingErr } = await sb
      .from("schedule_baseline")
      .select("id, anchor_date, effective_start")
      .eq("company_id", company.id)
      .eq("roster_member_id", rosterMemberId)
      .is("effective_end", null)
      .eq("is_active", true)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        {
          error: existingErr.message,
          detail: existingErr,
          step: "existing_lookup",
        },
        { status: 500 }
      );
    }

    const rotationMode = cleanText(body.rotation_mode) ?? "NONE";
    const anchorDate = existing?.anchor_date ?? todayIso();
    const effectiveStart = cleanText(body.effective_start) ?? existing?.effective_start ?? todayIso();

    const writePayload = {
      company_id: company.id,
      roster_member_id: rosterMemberId,
      preset_id: cleanText(body.preset_id),
      rotation_mode: rotationMode,
      anchor_date: anchorDate,
      effective_start: effectiveStart,
      default_route_s: cleanText(body.default_route_s),
      default_route_u: cleanText(body.default_route_u),
      default_route_m: cleanText(body.default_route_m),
      default_route_t: cleanText(body.default_route_t),
      default_route_w: cleanText(body.default_route_w),
      default_route_h: cleanText(body.default_route_h),
      default_route_f: cleanText(body.default_route_f),
      is_active: true,
      effective_end: null,
    };

    if (existing?.id) {
      const { error: updateErr } = await sb
        .from("schedule_baseline")
        .update(writePayload)
        .eq("id", existing.id);

      if (updateErr) {
        return NextResponse.json(
          {
            error: updateErr.message,
            detail: updateErr,
            step: "update",
            writePayload,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, mode: "update" });
    }

    const { error: insertErr } = await sb
      .from("schedule_baseline")
      .insert(writePayload);

    if (insertErr) {
      return NextResponse.json(
        {
          error: insertErr.message,
          detail: insertErr,
          step: "insert",
          writePayload,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, mode: "insert" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save schedule baseline.";

    return NextResponse.json(
      { error: message, step: "unhandled" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterMemberId } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", detail: companyErr },
        { status: 404 }
      );
    }

    const { error: updateErr } = await sb
      .from("schedule_baseline")
      .update({
        is_active: false,
        effective_end: todayIso(),
      })
      .eq("company_id", company.id)
      .eq("roster_member_id", rosterMemberId)
      .is("effective_end", null)
      .eq("is_active", true);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message, detail: updateErr, step: "delete" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove schedule.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}