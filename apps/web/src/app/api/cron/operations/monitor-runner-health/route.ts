import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildRunnerHealthEmail,
  type RunnerHealthNotificationPayload,
} from "@/features/automation/server/runnerHealthNotifications";

export const runtime = "nodejs";
export const maxDuration = 60;

function fromAddress() {
  const email = process.env.RESEND_FROM_EMAIL?.trim();
  if (!email) throw new Error("Missing RESEND_FROM_EMAIL.");
  return `${process.env.RESEND_FROM_NAME?.trim() || "Insight"} <${email}>`;
}

function appOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

function configuredRecipients() {
  return (process.env.RUNNER_ALERT_RECIPIENTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "get_pending_operations_runner_health_notifications"
  );
  if (error) {
    return NextResponse.json(
      { ok: false, step: "load_incidents", error: error.message },
      { status: 500 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const origin = appOrigin();
  const sent: string[] = [];
  const failed: Array<{ incident_id: string; error: string }> = [];

  for (const payload of (data ?? []) as RunnerHealthNotificationPayload[]) {
    let providerId: string | null = null;
    let sendError: string | null = null;

    try {
      if (!apiKey) throw new Error("Missing RESEND_API_KEY.");
      const recipients = Array.from(
        new Set([...configuredRecipients(), ...(payload.recipients ?? [])])
      );
      if (recipients.length === 0) {
        throw new Error("No active platform-owner runner alert recipient is configured.");
      }

      const incidentUrl = origin
        ? `${origin}/company/${encodeURIComponent(payload.company_slug)}/config/automation`
        : null;
      const message = buildRunnerHealthEmail(payload, incidentUrl);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `runner-health/${payload.notification_kind.toLowerCase()}/${payload.incident_id}`,
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: recipients,
          subject: message.subject,
          html: message.html,
        }),
      });
      const provider = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(provider?.message ?? "Runner health email failed.");
      }
      providerId = typeof provider?.id === "string" ? provider.id : null;
    } catch (error) {
      sendError = error instanceof Error ? error.message : "Runner health email failed.";
    }

    const { error: recordError } = await supabase.rpc(
      "record_operations_runner_health_notification_result",
      {
        p_incident_id: payload.incident_id,
        p_notification_kind: payload.notification_kind,
        p_provider_id: providerId,
        p_error: sendError,
      }
    );

    if (recordError) {
      failed.push({ incident_id: payload.incident_id, error: recordError.message });
    } else if (sendError) {
      failed.push({ incident_id: payload.incident_id, error: sendError });
    } else {
      sent.push(payload.incident_id);
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    inspected_count: (data ?? []).length,
    notification_sent_count: sent.length,
    notification_sent_incident_ids: sent,
    notification_failed_count: failed.length,
    notification_failures: failed,
  });
}
