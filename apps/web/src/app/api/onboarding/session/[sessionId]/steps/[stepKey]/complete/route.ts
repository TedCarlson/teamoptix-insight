import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; stepKey: string }> }
) {
  try {
    const { sessionId, stepKey } = await params;
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase
      .from("onboarding_step_progress")
      .upsert(
        {
          session_id: sessionId,
          step_key: stepKey,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: "session_id,step_key",
        }
      );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete onboarding step.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}