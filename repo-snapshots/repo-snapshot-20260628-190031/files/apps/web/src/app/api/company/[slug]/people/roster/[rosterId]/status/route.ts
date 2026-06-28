import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
    const effectiveDate =
      cleanText(body.effective_date) ?? new Date().toISOString().slice(0, 10);
    const note = cleanText(body.note);

    const { data, error } = await supabase.rpc("roster_set_employment_status", {
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

    return NextResponse.json({
      ok: true,
      roster: {
        roster_member_id: data?.roster_id ?? rosterId,
        employment_status: data?.employment_status ?? status,
        separation_date: data?.separation_date ?? null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update roster status.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
