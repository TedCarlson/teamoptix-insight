import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const stageKey = cleanText(body.stage_key);
    const note = cleanText(body.note);

    if (!stageKey) {
      return NextResponse.json({ error: "stage_key is required." }, { status: 400 });
    }

    const { error } = await supabase.rpc("candidate_stage_set", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_stage_key: stageKey,
      p_note: note,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to update candidate stage.", detail: error.message },
        { status: 500 }
      );
    }

    const { data: persisted, error: persistedError } = await supabase
      .from("roster_candidate_stage_v")
      .select("roster_id, stage_key, default_label, is_terminal, stage_sort_order")
      .eq("roster_id", rosterId)
      .maybeSingle();

    if (persistedError || !persisted || persisted.stage_key !== stageKey) {
      console.error("[candidate-stage:patch] verification failed", {
        rosterId,
        field: "stage_key",
        detail: persistedError?.message ?? null,
      });
      return NextResponse.json(
        {
          error: "Candidate stage could not be verified after saving.",
          detail: "The candidate stage did not match the submitted update. Please try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        stage: {
          ...persisted,
          stage_label: persisted.default_label,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update candidate stage.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
