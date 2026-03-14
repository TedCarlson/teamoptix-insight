import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const body = await req.json();

  const { token } = body;

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
    return NextResponse.json(
      { error: "invite expired" },
      { status: 400 }
    );
  }

  const { data: session, error: sessionError } = await supabase
    .from("onboarding_session")
    .insert({
      candidate_id: invite.candidate_id,
      pc_org_id: invite.pc_org_id,
      invite_token: token
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
      used_at: new Date().toISOString()
    })
    .eq("token", token);

  return NextResponse.json({
    success: true,
    session_id: session.id
  });
}