import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function generateToken() {
  return randomBytes(24).toString("hex");
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const body = await req.json();

    const { candidate_id, pc_org_id, email } = body;

    if (!candidate_id || !pc_org_id || !email) {
      return NextResponse.json(
        { error: "missing fields" },
        { status: 400 }
      );
    }

    const token = generateToken();

    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    /**
     * Expire any existing active invites for this candidate
     */
    const { error: expireError } = await supabase
      .from("hiring_invite_token")
      .update({
        status: "expired"
      })
      .eq("candidate_id", candidate_id)
      .eq("status", "active");

    if (expireError) {
      return NextResponse.json(
        { error: expireError.message },
        { status: 500 }
      );
    }

    /**
     * Create new invite token
     */
    const { error: insertError } = await supabase
      .from("hiring_invite_token")
      .insert({
        candidate_id,
        pc_org_id,
        email,
        token,
        status: "active",
        expires_at: expires.toISOString()
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const origin = new URL(req.url).origin;

    const inviteUrl = `${origin}/onboarding/invite/${token}`;

    return NextResponse.json({
      success: true,
      invite_url: inviteUrl
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}