import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createRosterInviteAuthLink } from "@/features/hiring/server/rosterInviteAuth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
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

    const { data: access, error: accessError } = await supabase.rpc("access_context");

    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 500 });
    }

    const membership = Array.isArray(access?.memberships)
      ? access.memberships.find(
          (item: { company_slug?: string }) => item.company_slug === slug
        )
      : null;
    const canInvite =
      Boolean(access?.is_platform_owner) ||
      (membership?.relationship_type === "admin" &&
        membership?.membership_status === "active");

    if (!canInvite) {
      return NextResponse.json(
        { error: "You do not have permission to invite company users." },
        { status: 403 }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug, company_name")
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

    const token = generateToken();

    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const resendApiKey = requireEnv("RESEND_API_KEY");
    const emailFrom = requireEnv("RESEND_FROM_EMAIL");
    const appBaseUrl =
      process.env.APP_BASE_URL?.trim() || new URL(req.url).origin;
    const normalizedBaseUrl = appBaseUrl.replace(/\/$/, "");
    const onboardingDestination = `/onboarding/invite/${token}`;
    const admin = getSupabaseAdminClient();

    const authLink = await createRosterInviteAuthLink(admin.auth.admin, {
      email: recipientEmail,
      redirectTo: (shouldSetPassword) =>
        `${normalizedBaseUrl}/auth/callback` +
        `?setPassword=${shouldSetPassword ? "1" : "0"}` +
        `&next=${encodeURIComponent(onboardingDestination)}`,
      fullName: roster.full_name,
      companySlug: company.company_slug,
      rosterId,
    });

    const { data: preparedInvite, error: prepareError } = await supabase.rpc(
      "prepare_company_roster_app_invite",
      {
        p_company_slug: slug,
        p_roster_id: rosterId,
        p_auth_user_id: authLink.authUserId,
        p_token: token,
        p_expires_at: expires.toISOString(),
      }
    );

    if (prepareError || !preparedInvite?.token_id) {
      return NextResponse.json(
        {
          error:
            prepareError?.message ??
            "Failed to prepare the employee's app access.",
        },
        { status: 500 }
      );
    }

    const tokenRow = {
      id: String(preparedInvite.token_id),
    };
    const inviteUrl = authLink.actionLink;
    const emailCompanyName = escapeHtml(company.company_name);
    const emailInviteUrl = escapeHtml(inviteUrl);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipientEmail],
        subject: `You're invited to ${company.company_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #17213a;">
            <h2 style="margin: 0 0 12px;">You’ve been invited to ${emailCompanyName}</h2>
            <p style="margin: 0 0 12px;">
              Accept the invitation, secure your account, and complete your app setup.
            </p>
            <p style="margin: 0 0 16px;">
              <a
                href="${emailInviteUrl}"
                style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;"
              >
                Accept invitation
              </a>
            </p>
            <p style="margin: 0 0 8px;">If the button does not work, use this link:</p>
            <p style="margin: 0; word-break: break-all;">${emailInviteUrl}</p>
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

    const { error: rosterInvitePersistError } = await supabase.rpc("mark_roster_invite_sent", {
      p_company_id: company.id,
      p_roster_id: rosterId,
      p_full_name: roster.full_name,
      p_email: recipientEmail,
      p_token_id: tokenRow.id,
      p_email_provider_id: typeof resendJson?.id === "string" ? resendJson.id : null,
    });

    if (rosterInvitePersistError) {
      return NextResponse.json(
        {
          error: `Invite email sent, but roster invite status was not persisted: ${rosterInvitePersistError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        roster_id: rosterId,
        company_id: company.id,
        token_id: String(tokenRow.id),
        token,
        email: recipientEmail,
        invite_status: "Invited",
        profile_id: String(preparedInvite.profile_id),
        membership_id: String(preparedInvite.membership_id),
        membership_status: String(preparedInvite.membership_status),
        access_href: `/company/${company.company_slug}/config/access`,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send roster invite.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
