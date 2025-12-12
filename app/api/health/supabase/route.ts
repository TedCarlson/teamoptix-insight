import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const hasUrl = !!url;
  const hasAnon = !!anon;

  if (!hasUrl || !hasAnon) {
    return NextResponse.json(
      { ok: false, hasUrl, hasAnon, message: "Missing Supabase env vars" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url!, anon!);

    // This call should succeed even without a logged-in user (session will be null).
    const { data, error } = await supabase.auth.getSession();

    return NextResponse.json({
      ok: !error,
      hasUrl,
      hasAnon,
      session: data?.session ? "present" : "null",
      error: error?.message ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, hasUrl, hasAnon, message: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
