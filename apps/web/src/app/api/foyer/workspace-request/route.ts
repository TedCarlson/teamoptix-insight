import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/security/turnstile";

export const runtime = "nodejs";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const captchaToken = clean(body.captchaToken);

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

    const payload = {
      companyName: clean(body.companyName),
      ownerName: clean(body.ownerName),
      email: clean(body.email).toLowerCase(),
      phone: clean(body.phone),
      terminal: clean(body.terminal),
      routeCount: clean(body.routeCount),
      employeeCount: clean(body.employeeCount),
      currentSystems: clean(body.currentSystems),
      operation: clean(body.operation),
      priorities: clean(body.priorities),
    };

    if (!payload.companyName || !payload.ownerName || !payload.email) {
      return NextResponse.json(
        { error: "Company name, owner contact, and email are required." },
        { status: 400 }
      );
    }

    const resendApiKey = requireEnv("RESEND_API_KEY");
    const emailFrom = requireEnv("RESEND_FROM_EMAIL");
    const emailFromName = process.env.RESEND_FROM_NAME?.trim() || "Insight";
    const to = process.env.FOYER_REQUEST_TO_EMAIL?.trim() || "admin@teamoptix.io";

    const rows = [
      ["Company", payload.companyName],
      ["Owner", payload.ownerName],
      ["Email", payload.email],
      ["Phone", payload.phone],
      ["Terminal / Location", payload.terminal],
      ["Routes", payload.routeCount],
      ["Employees", payload.employeeCount],
      ["Current systems", payload.currentSystems],
      ["Operation notes", payload.operation],
      ["First priorities", payload.priorities],
    ];

    const htmlRows = rows
      .map(
        ([label, value]) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e6edf5;color:#64748b;font-weight:700;width:180px;">${escapeHtml(label)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e6edf5;color:#0f172a;font-weight:700;">${escapeHtml(value || "—")}</td>
          </tr>`
      )
      .join("");

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${emailFromName} <${emailFrom}>`,
        to: [to],
        cc: [payload.email],
        reply_to: payload.email,
        subject: `New Insight workspace request: ${payload.companyName}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17213a;">
            <p style="margin:0 0 8px;color:#10b981;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">Workspace Request</p>
            <h1 style="margin:0 0 18px;font-size:28px;">New Insight workspace request</h1>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e6edf5;border-radius:12px;overflow:hidden;">
              <tbody>${htmlRows}</tbody>
            </table>
          </div>
        `,
      }),
    });

    const resendJson = await resendResponse.json().catch(() => null);

    if (!resendResponse.ok) {
      return NextResponse.json(
        { error: resendJson?.message ?? "Failed to send workspace request." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, resend_id: resendJson?.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send workspace request." },
      { status: 500 }
    );
  }
}
