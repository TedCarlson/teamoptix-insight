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

    const roster_id =
      typeof body?.roster_id === "string" ? body.roster_id.trim() : "";
    const company_id =
      typeof body?.company_id === "string" ? body.company_id.trim() : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!roster_id || !company_id || !email) {
      return NextResponse.json(
        { error: "missing fields" },
        { status: 400 }
      );
    }

    const token = generateToken();

    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    /**
     * Canonical contract for this project is:
     *   - roster_id
     *   - company_id
     *   - email
     *
     * The table still carries legacy column names today.
     * Keep that mapping trapped here until DB rename/migration is done.
     */
    const legacyCandidateId = roster_id;
    const legacyCompanyId = company_id;

    /**
     * Expire any existing active invites for this roster person
     */
    const { error: expireError } = await supabase
      .from("hiring_invite_token")
      .update({
        status: "expired"
      })
      .eq("candidate_id", legacyCandidateId)
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
        candidate_id: legacyCandidateId,
        pc_org_id: legacyCompanyId,
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

    const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
    const origin = configuredBaseUrl || new URL(req.url).origin;
    const inviteUrl = `${origin}/onboarding/invite/${token}`;

    return NextResponse.json({
      success: true,
      invite_url: inviteUrl,
      token,
      roster_id,
      company_id,
      email
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create invite.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}