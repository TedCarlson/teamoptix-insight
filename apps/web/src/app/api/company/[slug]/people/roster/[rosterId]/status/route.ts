import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { defaultDriverEffectiveDate } from "@/features/people/lib/driverPromotionDate";

export const runtime = "nodejs";

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const status = cleanText(body.employment_status);
    const requestedEffectiveDate = cleanText(body.effective_date);
    const effectiveDate =
      requestedEffectiveDate ?? new Date().toISOString().slice(0, 10);
    const note = cleanText(body.note);

    const { data: currentRoster, error: currentRosterError } = await supabase
      .from("company_roster_view")
      .select("employment_status")
      .eq("roster_member_id", rosterId)
      .maybeSingle();

    if (currentRosterError || !currentRoster) {
      return NextResponse.json(
        { error: currentRosterError?.message ?? "Roster member not found." },
        { status: currentRosterError ? 400 : 404 },
      );
    }

    if (currentRoster.employment_status === "Trainee" && status === "Active") {
      const { data: promotion, error: promotionError } = await supabase.rpc(
        "promote_company_trainee_to_driver",
        {
          p_company_slug: slug,
          p_roster_id: rosterId,
          p_effective_date:
            requestedEffectiveDate ?? defaultDriverEffectiveDate(),
        },
      );

      if (promotionError || promotion?.error) {
        return NextResponse.json(
          { error: promotionError?.message ?? promotion.error },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        promoted: true,
        promotion,
        roster: {
          roster_member_id: rosterId,
          employment_status: "Active",
          separation_date: null,
        },
      });
    }

    const { error } = await supabase.rpc("roster_set_employment_status", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_status: status,
      p_effective_date: effectiveDate,
      p_note: note,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (status !== "Trainee") {
      const { error: closeTraineePayError } = await supabase.rpc(
        "close_roster_trainee_pay_override",
        {
          p_company_slug: slug,
          p_roster_id: rosterId,
          p_effective_end: effectiveDate,
        }
      );

      if (closeTraineePayError) {
        return NextResponse.json(
          { error: closeTraineePayError.message },
          { status: 400 }
        );
      }
    }

    const { data: persisted, error: persistedError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, employment_status, separation_date")
      .eq("roster_member_id", rosterId)
      .maybeSingle();

    if (
      persistedError ||
      !persisted ||
      persisted.employment_status !== status
    ) {
      console.error("[roster-status:patch] verification failed", {
        rosterId,
        field: "employment_status",
        detail: persistedError?.message ?? null,
      });
      return NextResponse.json(
        {
          error: "Status could not be verified after saving.",
          detail: "The roster status did not match the submitted update. Please try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      roster: {
        roster_member_id: persisted.roster_member_id,
        employment_status: persisted.employment_status,
        separation_date: persisted.separation_date,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update roster status.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
