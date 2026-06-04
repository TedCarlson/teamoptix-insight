import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const returnTo =
      typeof body?.returnTo === "string" && body.returnTo.startsWith("/")
        ? body.returnTo
        : "/profile";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/$/, "");
    const resendApiKey = requireEnv("RESEND_API_KEY");
    const emailFrom = requireEnv("RESEND_FROM_EMAIL");
    const emailFromName = process.env.RESEND_FROM_NAME?.trim() || "Insight";

    const callbackUrl =
      `${appBaseUrl}/auth/callback?setPassword=1&next=${encodeURIComponent(returnTo)}`;

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const actionLink = data.properties?.action_link;

    if (!actionLink) {
      return NextResponse.json(
        { error: "Supabase did not return an action link." },
        { status: 500 }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${emailFromName} <${emailFrom}>`,
        to: [email],
        subject: "Set your Insight password",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #17213a;">
            <h2 style="margin: 0 0 12px;">Set your Insight password</h2>
            <p style="margin: 0 0 12px;">
              Use this secure link to create or reset your password and continue into Insight.
            </p>
            <p style="margin: 0 0 16px;">
              <a
                href="${actionLink}"
                style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;"
              >
                Set Password
              </a>
            </p>
            <p style="margin: 0 0 8px;">If the button does not work, use this link:</p>
            <p style="margin: 0; word-break: break-all;">${actionLink}</p>
          </div>
        `,
      }),
    });

    const resendJson = await resendResponse.json().catch(() => null);

    if (!resendResponse.ok) {
      return NextResponse.json(
        {
          error:
            typeof resendJson?.message === "string"
              ? resendJson.message
              : "Failed to send password email.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send password link.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
