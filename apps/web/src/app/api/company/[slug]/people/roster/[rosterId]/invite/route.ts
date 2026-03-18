import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function generateToken() {
  return randomBytes(24).toString("hex");
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    const { data: roster, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, company_id, full_name, email, invite_status")
      .eq("roster_member_id", rosterId)
      .eq("company_id", company.id)
      .single();

    if (rosterError || !roster) {
      return NextResponse.json(
        { error: "Roster record not found." },
        { status: 404 }
      );
    }

    const recipientEmail =
      typeof roster.email === "string" ? roster.email.trim().toLowerCase() : "";

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Roster email is missing." },
        { status: 400 }
      );
    }

    /**
     * Canonical project contract:
     *   - roster_id
     *   - company_id
     *
     * Legacy token table still carries:
     *   - candidate_id
     *   - pc_org_id
     *
     * Keep that mapping trapped in this route until DB cleanup is done.
     */
    const legacyCandidateId = rosterId;
    const legacyCompanyId = company.id;

    const { error: expireError } = await supabase
      .from("hiring_invite_token")
      .update({ status: "expired" })
      .eq("candidate_id", legacyCandidateId)
      .eq("status", "active");

    if (expireError) {
      return NextResponse.json(
        { error: expireError.message },
        { status: 500 }
      );
    }

    const token = generateToken();

    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const { data: tokenRow, error: insertError } = await supabase
      .from("hiring_invite_token")
      .insert({
        candidate_id: legacyCandidateId,
        pc_org_id: legacyCompanyId,
        email: recipientEmail,
        token,
        status: "active",
        expires_at: expires.toISOString(),
      })
      .select("id, token, email, candidate_id, pc_org_id")
      .single();

    if (insertError || !tokenRow) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create invite token." },
        { status: 500 }
      );
    }

    const resendApiKey = requireEnv("RESEND_API_KEY");
    const emailFrom = requireEnv("EMAIL_FROM");
    const appBaseUrl =
      process.env.APP_BASE_URL?.trim() || new URL(req.url).origin;

    const inviteUrl = `${appBaseUrl}/onboarding/invite/${encodeURIComponent(token)}`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipientEmail],
        subject: "You're invited to join",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #17213a;">
            <h2 style="margin: 0 0 12px;">You’ve been invited</h2>
            <p style="margin: 0 0 12px;">
              Click below to complete your setup.
            </p>
            <p style="margin: 0 0 16px;">
              <a
                href="${inviteUrl}"
                style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;"
              >
                Accept Invite
              </a>
            </p>
            <p style="margin: 0 0 8px;">If the button does not work, use this link:</p>
            <p style="margin: 0; word-break: break-all;">${inviteUrl}</p>
          </div>
        `,
      }),
    });

    const resendJson = (await resendResponse.json().catch(() => null)) as
      | { id?: string; message?: string }
      | null;

    if (!resendResponse.ok) {
      await supabase
        .from("hiring_invite_token")
        .update({ status: "failed" })
        .eq("id", tokenRow.id);

      await supabase.from("company_roster_event").insert({
        company_id: company.id,
        roster_id: rosterId,
        event_category: "onboarding",
        event_type: "invite_failed",
        event_detail: "Invite email failed from roster.",
        event_metadata: {
          source: "roster_invite_button",
          full_name: roster.full_name,
          email: recipientEmail,
          token_id: tokenRow.id,
          error_message:
            typeof resendJson?.message === "string"
              ? resendJson.message
              : "Email send failed.",
        },
        occurred_at: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          error:
            typeof resendJson?.message === "string"
              ? resendJson.message
              : "Failed to send invite email.",
        },
        { status: 500 }
      );
    }

    await supabase
      .from("company_roster")
      .update({ invite_status: "Invited" })
      .eq("id", rosterId);

    await supabase.from("company_roster_event").insert({
      company_id: company.id,
      roster_id: rosterId,
      event_category: "onboarding",
      event_type: "invite_sent",
      event_detail: "Invite email sent from roster.",
      event_metadata: {
        source: "roster_invite_button",
        full_name: roster.full_name,
        email: recipientEmail,
        token_id: tokenRow.id,
        email_provider_id:
          typeof resendJson?.id === "string" ? resendJson.id : null,
      },
      occurred_at: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        ok: true,
        roster_id: rosterId,
        company_id: company.id,
        token_id: String(tokenRow.id),
        token,
        email: recipientEmail,
        invite_status: "Invited",
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send roster invite.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}