import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildResignationCompletionEmail,
  type ResignationNotificationPayload,
} from "@/features/schedule/lib/resignationWorkflow";

export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: processResult, error: processError } = await supabase.rpc(
    "process_due_resignation_workflows"
  );
  if (processError) {
    return NextResponse.json(
      { ok: false, error: processError.message, step: "process_due" },
      { status: 500 }
    );
  }

  const { data: pendingData, error: pendingError } = await supabase.rpc(
    "get_pending_resignation_notifications"
  );
  if (pendingError) {
    return NextResponse.json(
      { ok: false, error: pendingError.message, step: "load_notifications" },
      { status: 500 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const origin = appOrigin();
  const sent: string[] = [];
  const failed: Array<{ workflow_id: string; error: string }> = [];

  for (const payload of (pendingData ?? []) as ResignationNotificationPayload[]) {
    let providerId: string | null = null;
    let sendError: string | null = null;

    try {
      if (!apiKey) throw new Error("Missing RESEND_API_KEY.");
      if (!Array.isArray(payload.recipients) || payload.recipients.length === 0) {
        throw new Error("AO and Business Contact email recipients are not configured.");
      }

      const workflowUrl = origin
        ? `${origin}/company/${encodeURIComponent(payload.company_slug)}/schedule/overrides#${payload.workflow_id}`
        : null;
      const message = buildResignationCompletionEmail(payload, workflowUrl);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `resignation-completed/${payload.workflow_id}`,
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: payload.recipients,
          subject: message.subject,
          html: message.html,
        }),
      });
      const provider = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(provider?.message ?? "Resignation completion email failed.");
      }
      providerId = typeof provider?.id === "string" ? provider.id : null;
    } catch (error) {
      sendError = error instanceof Error ? error.message : "Completion email failed.";
    }

    const { error: recordError } = await supabase.rpc(
      "record_resignation_notification_result",
      {
        p_override_id: payload.workflow_id,
        p_provider_id: providerId,
        p_error: sendError,
      }
    );

    if (recordError) {
      failed.push({ workflow_id: payload.workflow_id, error: recordError.message });
    } else if (sendError) {
      failed.push({ workflow_id: payload.workflow_id, error: sendError });
    } else {
      sent.push(payload.workflow_id);
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    process: processResult ?? {},
    notification_sent_count: sent.length,
    notification_sent_workflow_ids: sent,
    notification_failed_count: failed.length,
    notification_failures: failed,
  });
}
