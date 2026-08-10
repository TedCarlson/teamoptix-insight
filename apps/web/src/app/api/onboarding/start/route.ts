import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const body = await req.json();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const token =
      typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: "missing token" },
        { status: 400 }
      );
    }

    const { data: invite, error } = await admin
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

    if (invite.status !== "active" && invite.status !== "used") {
      return NextResponse.json(
        { error: "invite inactive" },
        { status: 400 }
      );
    }

    const now = new Date();
    const expires = new Date(invite.expires_at);

    if (expires < now) {
      await admin
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
      typeof invite.roster_id === "string"
        ? invite.roster_id
        : String(invite.roster_id ?? invite.candidate_id ?? "");
    const company_id =
      typeof invite.company_id === "string"
        ? invite.company_id
        : String(invite.company_id ?? invite.pc_org_id ?? "");
    const email =
      typeof invite.email === "string"
        ? invite.email.trim().toLowerCase()
        : "";

    if (!roster_id || !company_id || !email) {
      return NextResponse.json(
        { error: "invite missing required fields" },
        { status: 400 }
      );
    }

    if (!user.email || user.email.trim().toLowerCase() !== email) {
      return NextResponse.json(
        { error: "This invitation belongs to a different email address." },
        { status: 403 }
      );
    }

    const { data: existingSession } = await admin
      .from("onboarding_session")
      .select("id, status, roster_id, company_id, auth_user_id")
      .eq("invite_token", token)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession?.id) {
      if (
        existingSession.auth_user_id &&
        existingSession.auth_user_id !== user.id
      ) {
        return NextResponse.json(
          { error: "This invitation is already attached to another account." },
          { status: 409 }
        );
      }

      if (!existingSession.auth_user_id) {
        const { error: bindError } = await admin
          .from("onboarding_session")
          .update({ auth_user_id: user.id })
          .eq("id", existingSession.id)
          .is("auth_user_id", null);

        if (bindError) {
          return NextResponse.json({ error: bindError.message }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        session_id: existingSession.id,
        roster_id: existingSession.roster_id ?? roster_id,
        company_id: existingSession.company_id ?? company_id,
        email,
        session_status: existingSession.status ?? null,
      });
    }

    const { data: session, error: sessionError } = await admin
      .from("onboarding_session")
      .insert({
        roster_id,
        company_id,
        candidate_id: roster_id,
        pc_org_id: company_id,
        invite_token: token,
        auth_user_id: user.id,
        status: "in_progress",
      })
      .select("id, status, roster_id, company_id")
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message ?? "Failed to create onboarding session." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session_id: session.id,
      roster_id: session.roster_id ?? roster_id,
      company_id: session.company_id ?? company_id,
      email,
      session_status: session.status ?? null,
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
