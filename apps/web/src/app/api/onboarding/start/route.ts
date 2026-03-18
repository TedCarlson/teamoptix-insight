import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const body = await req.json();

    const token =
      typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: "missing token" },
        { status: 400 }
      );
    }

    const { data: invite, error } = await supabase
      .from("hiring_invite_token")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !invite) {
      return NextResponse.json(
        { error: "invalid invite" },
        { status: 400 }
      );
    }

    if (invite.status !== "active") {
      return NextResponse.json(
        { error: "invite inactive" },
        { status: 400 }
      );
    }

    const now = new Date();
    const expires = new Date(invite.expires_at);

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
      typeof invite.roster_id === "string" ? invite.roster_id : String(invite.roster_id ?? "");
    const company_id =
      typeof invite.company_id === "string" ? invite.company_id : String(invite.company_id ?? "");
    const email =
      typeof invite.email === "string" ? invite.email.trim().toLowerCase() : "";

    if (!roster_id || !company_id || !email) {
      return NextResponse.json(
        { error: "invite missing required fields" },
        { status: 400 }
      );
    }

    const { data: existingSession } = await supabase
      .from("onboarding_session")
      .select("id, status")
      .eq("invite_token", token)
      .maybeSingle();

    if (existingSession?.id) {
      return NextResponse.json({
        success: true,
        session_id: existingSession.id,
        roster_id,
        company_id,
        email,
      });
    }

    const { data: session, error: sessionError } = await supabase
      .from("onboarding_session")
      .insert({
        roster_id,
        company_id,
        candidate_id: roster_id,
        pc_org_id: company_id,
        invite_token: token,
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message },
        { status: 500 }
      );
    }

    await supabase
      .from("hiring_invite_token")
      .update({
        status: "used",
        used_at: new Date().toISOString(),
      })
      .eq("token", token)
      .eq("status", "active");

    return NextResponse.json({
      success: true,
      session_id: session.id,
      roster_id,
      company_id,
      email,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to start onboarding.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}