import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const weekEnd = req.nextUrl.searchParams.get("weekEnd");
  const supabase = await getSupabaseServerClient();

  if (!weekEnd) {
    return NextResponse.json({ error: "weekEnd is required.", adjustments: [] }, { status: 400 });
  }

  const weekStart = addDays(weekEnd, -6);

  const { data: adjustments, error } = await supabase
    .from("company_payroll_adjustment_event_v")
    .select("*")
    .eq("company_slug", slug)
    .eq("is_active", true)
    .lte("start_date", weekEnd)
    .gte("end_date", weekStart)
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, adjustments: [] }, { status: 500 });
  }

  return NextResponse.json({ adjustments: adjustments ?? [] }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const supabase = await getSupabaseServerClient();

    const action = text(body.action);

    if (action === "reverse") {
      const originalAdjustmentId = text(body.adjustment_event_id);
      const reason = text(body.reason);

      if (!originalAdjustmentId) {
        return NextResponse.json(
          { error: "Adjustment event id is required." },
          { status: 400 }
        );
      }

      if (!reason) {
        return NextResponse.json(
          { error: "A reversal reason is required." },
          { status: 400 }
        );
      }

      const { data: original, error: originalError } = await supabase
        .from("company_payroll_adjustment_event_v")
        .select("*")
        .eq("company_slug", slug)
        .eq("adjustment_event_id", originalAdjustmentId)
        .eq("is_active", true)
        .single();

      if (originalError || !original) {
        return NextResponse.json(
          { error: "Adjustment not found or is not active." },
          { status: 404 }
        );
      }

      const existingReversalNeedle = `Reversal of adjustment ${originalAdjustmentId}`;
      const { data: existingReversals, error: existingReversalError } = await supabase
        .from("company_payroll_adjustment_event_v")
        .select("adjustment_event_id")
        .eq("company_slug", slug)
        .eq("is_active", true)
        .ilike("notes", `%${existingReversalNeedle}%`)
        .limit(1);

      if (existingReversalError) {
        return NextResponse.json(
          { error: "Failed to check reversal history.", detail: existingReversalError.message },
          { status: 500 }
        );
      }

      if ((existingReversals ?? []).length > 0) {
        return NextResponse.json(
          { error: "This adjustment already has a reversal row." },
          { status: 409 }
        );
      }

      const { data: targets, error: targetError } = original.adjustment_scope === "TARGETED"
        ? await supabase
            .from("company_payroll_adjustment_target_v")
            .select("roster_member_id")
            .eq("company_slug", slug)
            .eq("adjustment_event_id", originalAdjustmentId)
        : { data: [], error: null };

      if (targetError) {
        return NextResponse.json(
          { error: "Failed to load adjustment targets.", detail: targetError.message },
          { status: 500 }
        );
      }

      const rosterMemberIds = Array.isArray(targets)
        ? targets
            .map((target: { roster_member_id?: unknown }) => target.roster_member_id)
            .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        : [];

      if (original.adjustment_scope === "TARGETED" && rosterMemberIds.length === 0) {
        return NextResponse.json(
          { error: "Cannot reverse targeted adjustment because no targets were found." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase.rpc("create_company_payroll_adjustment", {
        p_company_slug: slug,
        p_adjustment_key: "REVERSAL",
        p_adjustment_label: `Reversal: ${String(original.adjustment_label ?? "Adjustment")}`.slice(0, 120),
        p_adjustment_scope: String(original.adjustment_scope ?? "GLOBAL"),
        p_start_date: String(original.start_date),
        p_end_date: String(original.end_date),
        p_amount: Number(original.amount ?? 0) * -1,
        p_amount_mode: String(original.amount_mode ?? "DAILY"),
        p_notes: `${existingReversalNeedle}: ${reason}`,
        p_roster_member_ids: rosterMemberIds,
      });

      if (error) {
        return NextResponse.json(
          { error: "Failed to create reversal.", detail: error.message, code: error.code ?? null },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          result: data,
          rebuild_status: "not_rebuilt",
          message: "Reversal saved. Rebuild payroll to apply it to the selected week.",
        },
        { status: 200 }
      );
    }

    const adjustmentLabel = text(body.adjustment_label);
    const adjustmentScope = text(body.adjustment_scope);
    const startDate = text(body.start_date);
    const endDate = text(body.end_date);
    const amount = Number(body.amount ?? 0);

    const rosterMemberIds = Array.isArray(body.roster_member_ids)
      ? body.roster_member_ids.filter((id: unknown) => typeof id === "string" && id.trim())
      : [];

    if (!adjustmentLabel || !adjustmentScope || !startDate || !endDate) {
      return NextResponse.json(
        {
          error:
            "Adjustment label, scope, start date, and end date are required.",
        },
        { status: 400 }
      );
    }

    if (!["GLOBAL", "TARGETED"].includes(adjustmentScope)) {
      return NextResponse.json(
        { error: "Adjustment scope must be GLOBAL or TARGETED." },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "Adjustment start date cannot be after end date." },
        { status: 400 }
      );
    }

    if (adjustmentScope === "TARGETED" && rosterMemberIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one driver for a targeted adjustment." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "Adjustment amount must be a valid number." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("create_company_payroll_adjustment", {
      p_company_slug: slug,
      p_adjustment_key: text(body.adjustment_key) || "PAYROLL_ADJUSTMENT",
      p_adjustment_label: adjustmentLabel,
      p_adjustment_scope: adjustmentScope,
      p_start_date: startDate,
      p_end_date: endDate,
      p_amount: amount,
      p_amount_mode: text(body.amount_mode) || "DAILY",
      p_notes: text(body.notes),
      p_roster_member_ids: rosterMemberIds,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to create adjustment.", detail: error.message, code: error.code ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        result: data,
        rebuild_status: "not_rebuilt",
        message: "Adjustment saved. Rebuild payroll to apply it to the selected week.",
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create adjustment.", detail: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
