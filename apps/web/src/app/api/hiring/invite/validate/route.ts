import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token")?.trim();

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
      await supabase
        .from("hiring_invite_token")
        .update({
          status: "expired",
          expires_at: now.toISOString(),
        })
        .eq("token", token)
        .eq("status", "active");

      return NextResponse.json(
        { error: "invite expired" },
        { status: 400 }
      );
    }

    const roster_id =
      typeof data.roster_id === "string"
        ? data.roster_id
        : String(data.roster_id ?? data.candidate_id ?? "");

    const company_id =
      typeof data.company_id === "string"
        ? data.company_id
        : String(data.company_id ?? data.pc_org_id ?? "");

    const invite = {
      id: String(data.id),
      roster_id,
      company_id,
      email: String(data.email ?? ""),
      token: String(data.token),
      status: String(data.status),
      expires_at: String(data.expires_at),
      used_at: data.used_at ? String(data.used_at) : null,
      created_at: String(data.created_at),
    };

    return NextResponse.json({
      success: true,
      invite,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to validate invite.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}