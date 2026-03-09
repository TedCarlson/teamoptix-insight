import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return NextResponse.json({
        ok: true,
        user: null,
      });
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        user: null,
      });
    }

    return NextResponse.json({
      ok: true,
      user: user
        ? {
            id: user.id,
            email: user.email ?? null,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown session error";

    return NextResponse.json(
      { ok: false, error: message, user: null },
      { status: 500 }
    );
  }
}
