import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const supabase = await getSupabaseServerClient();

    const { data: session, error: sessionError } = await supabase
      .from("onboarding_session")
      .select("id, candidate_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Onboarding session not found." },
        { status: 404 }
      );
    }

    const completedAt = new Date().toISOString();

    const { error: completeError } = await supabase
      .from("onboarding_session")
      .update({
        status: "completed",
        completed_at: completedAt,
      })
      .eq("id", sessionId);

    if (completeError) {
      return NextResponse.json(
        { error: completeError.message },
        { status: 500 }
      );
    }

    const { error: rosterError } = await supabase
      .schema("core")
      .from("company_roster")
      .update({
        onboarding_completed_at: completedAt,
      })
      .eq("id", session.candidate_id);

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete onboarding.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}