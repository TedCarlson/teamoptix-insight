import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string; stepKey: string }>;
};

export async function POST(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const { sessionId, stepKey } = await context.params;
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: session, error: sessionError } = await supabase
      .from("onboarding_session")
      .select("id, status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Onboarding session not found." },
        { status: 404 }
      );
    }

    const { data: step, error: stepError } = await supabase
      .from("onboarding_step")
      .select("step_key, label, step_order")
      .eq("step_key", stepKey)
      .single();

    if (stepError || !step) {
      return NextResponse.json(
        { error: "Onboarding step not found." },
        { status: 404 }
      );
    }

    const completedAt = new Date().toISOString();

    const { error: progressError } = await supabase
      .from("onboarding_step_progress")
      .upsert(
        {
          session_id: sessionId,
          step_key: stepKey,
          completed: true,
          completed_at: completedAt,
        },
        {
          onConflict: "session_id,step_key",
        }
      );

    if (progressError) {
      return NextResponse.json(
        { error: progressError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        step: {
          step_key: step.step_key,
          label: step.label,
          step_order: step.step_order,
          completed: true,
          completed_at: completedAt,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to complete onboarding step.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
