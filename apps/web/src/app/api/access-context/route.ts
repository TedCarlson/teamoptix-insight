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
      return NextResponse.json(null, { status: 200 });
    }

    const res = await fetch(
      process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/access_context",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    const data = await res.json();

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown access context error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
