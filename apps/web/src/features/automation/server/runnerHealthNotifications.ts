export type RunnerHealthNotificationPayload = {
  incident_id: string;
  notification_kind: "FAILURE" | "RECOVERY";
  issue_type: "RUNNER_ERROR" | "STALE_HEARTBEAT";
  incident_status: "OPEN" | "RESOLVED";
  company_slug: string;
  company_name: string;
  runner_key: string;
  runner_state: string;
  runner_last_seen_at: string | null;
  runner_last_error: string | null;
  opened_at: string;
  last_observed_at: string;
  resolved_at: string | null;
  recipients: string[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEastern(value: string | null) {
  if (!value) return "Never reported";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function issueLabel(issueType: RunnerHealthNotificationPayload["issue_type"]) {
  return issueType === "STALE_HEARTBEAT"
    ? "Runner heartbeat stopped"
    : "Runner entered an error state";
}

export function buildRunnerHealthEmail(
  payload: RunnerHealthNotificationPayload,
  incidentUrl: string | null
) {
  const recovered = payload.notification_kind === "RECOVERY";
  const subject = recovered
    ? `[RECOVERED] Collection runner · ${payload.company_name}`
    : `[ACTION REQUIRED] Collection runner failure · ${payload.company_name}`;
  const title = recovered
    ? "Collection runner recovered"
    : "Collection runner requires attention";
  const summary = recovered
    ? `The runner is reporting again after a ${issueLabel(payload.issue_type).toLowerCase()} incident.`
    : `${issueLabel(payload.issue_type)}. Scheduled collection may be incomplete until the runner recovers.`;
  const error = payload.runner_last_error?.trim() || "No runner error message was recorded.";
  const action = incidentUrl
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(incidentUrl)}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700">Open collection health</a></p>`
    : "";

  return {
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:680px;color:#0f172a;line-height:1.5">
        <p style="margin:0 0 8px;color:${recovered ? "#047857" : "#b91c1c"};font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Insight runner health</p>
        <h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(title)}</h1>
        <p style="margin:0 0 20px">${escapeHtml(summary)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tbody>
            <tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-weight:700">Company</td><td style="padding:8px;border-top:1px solid #e2e8f0">${escapeHtml(payload.company_name)}</td></tr>
            <tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-weight:700">Runner</td><td style="padding:8px;border-top:1px solid #e2e8f0">${escapeHtml(payload.runner_key)}</td></tr>
            <tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-weight:700">State</td><td style="padding:8px;border-top:1px solid #e2e8f0">${escapeHtml(payload.runner_state)}</td></tr>
            <tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-weight:700">Last heartbeat</td><td style="padding:8px;border-top:1px solid #e2e8f0">${escapeHtml(formatEastern(payload.runner_last_seen_at))}</td></tr>
            <tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-weight:700">Incident opened</td><td style="padding:8px;border-top:1px solid #e2e8f0">${escapeHtml(formatEastern(payload.opened_at))}</td></tr>
            <tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-weight:700">Reported detail</td><td style="padding:8px;border-top:1px solid #e2e8f0">${escapeHtml(error)}</td></tr>
          </tbody>
        </table>
        ${action}
        <p style="margin:24px 0 0;color:#64748b;font-size:12px">Incident ${escapeHtml(payload.incident_id)} · This message is deduplicated until recovery.</p>
      </div>
    `,
  };
}
