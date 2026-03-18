import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc(
      "complete_onboarding_session",
      {
        p_session_id: sessionId,
        p_auth_user_id: user.id,
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...data }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to complete onboarding.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}