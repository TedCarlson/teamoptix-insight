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

    const { data, error } = await supabase.rpc("candidate_stage_set", {
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

    return NextResponse.json({ ok: true, stage: data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update candidate stage.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
