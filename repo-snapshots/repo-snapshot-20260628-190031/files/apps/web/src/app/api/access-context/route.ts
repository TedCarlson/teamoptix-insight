import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json(
        { ok: false, stage: "getUser", error: userError.message },
        { status: 500 }
      );
    }

    if (!user?.id) {
      return NextResponse.json(null, { status: 200 });
    }

    const { error: ensureError } = await supabase.rpc("ensure_access_context");

    if (ensureError) {
      return NextResponse.json(
        {
          ok: false,
          stage: "ensure_access_context_rpc",
          auth_user_id: user.id,
          email: user.email,
          error: ensureError.message,
          details: ensureError.details,
          hint: ensureError.hint,
          code: ensureError.code,
        },
        { status: 500 }
      );
    }

    const { data, error } = await supabase.rpc("access_context");

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "access_context_rpc",
          auth_user_id: user.id,
          email: user.email,
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? null, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown access context error";

    return NextResponse.json(
      { ok: false, stage: "catch", error: message },
      { status: 500 }
    );
  }
}
