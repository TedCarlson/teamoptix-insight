import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: steps, error } = await supabase
      .from("onboarding_step")
      .select("step_key, label, step_order")
      .order("step_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, steps: [] },
        { status: 500 }
      );
    }

    const { data: progress, error: progressError } = await supabase
      .from("onboarding_step_progress")
      .select("step_key, completed, completed_at")
      .eq("session_id", sessionId);

    if (progressError) {
      return NextResponse.json(
        { error: progressError.message, steps: [] },
        { status: 500 }
      );
    }

    const progressMap = new Map(
      (progress ?? []).map((row) => [row.step_key, row])
    );

    const merged = (steps ?? []).map((step) => {
      const hit = progressMap.get(step.step_key) as
        | { step_key: string; completed: boolean; completed_at: string | null }
        | undefined;

      return {
        step_key: step.step_key,
        label: step.label,
        step_order: step.step_order,
        completed: hit?.completed ?? false,
        completed_at: hit?.completed_at ?? null,
      };
    });

    return NextResponse.json({ steps: merged }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load onboarding steps.";

    return NextResponse.json(
      { error: message, steps: [] },
      { status: 500 }
    );
  }
}