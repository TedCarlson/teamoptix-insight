import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "missing token" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("hiring_invite_token")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "invalid invite" },
        { status: 404 }
      );
    }

    const now = new Date();
    const expires = new Date(data.expires_at);

    if (data.status !== "active") {
      return NextResponse.json(
        { error: "invite inactive" },
        { status: 400 }
      );
    }

    if (data.used_at) {
      return NextResponse.json(
        { error: "invite already used" },
        { status: 400 }
      );
    }

    if (expires < now) {
      return NextResponse.json(
        { error: "invite expired" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      invite: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}