import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/security/turnstile";

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
        : "/workspace";
    const captchaToken =
      typeof body?.captchaToken === "string" ? body.captchaToken.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const turnstileRequired = process.env.TURNSTILE_REQUIRED === "true";

    if (turnstileRequired) {
      if (!captchaToken) {
        return NextResponse.json(
          { error: "Security verification is required." },
          { status: 400 }
        );
      }

      const remoteIp =
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

      const verified = await verifyTurnstile(captchaToken, remoteIp);

      if (!verified) {
        return NextResponse.json(
          { error: "Security verification failed. Please try again." },
          { status: 403 }
        );
      }
    }

    const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/$/, "");
    const resendApiKey = requireEnv("RESEND_API_KEY");
    const emailFrom = requireEnv("RESEND_FROM_EMAIL");
    const emailFromName = process.env.RESEND_FROM_NAME?.trim() || "Insight";

    const callbackUrl =
      `${appBaseUrl}/auth/callback?setPassword=1&next=${encodeURIComponent(returnTo)}`;

    const admin = getSupabaseAdminClient();

    const { data: users, error: listError } = await admin.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const target = users.users.find(
      (item) => item.email?.toLowerCase() === email
    );

    if (!target) {
      return NextResponse.json(
        {
          error:
            "We could not find an Insight user account for that email. If you are not already an Insight user, start with Team Optix and request an Insight workspace.",
          redirectTo: "/teamoptix",
        },
        { status: 404 }
      );
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
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
        subject: "Secure your Insight account",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #17213a;">
            <h2 style="margin: 0 0 12px;">Secure your Insight account</h2>
            <p style="margin: 0 0 12px;">
              Use this secure link to verify your email, create your password, and continue into Insight.
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
