const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addIsoDays(value: string, days: number) {
  if (!ISO_DATE.test(value)) throw new Error("Date must use YYYY-MM-DD format.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Date must be valid.");
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resignationImpactWindow(lastScheduledDate: string, days = 14) {
  const startDate = addIsoDays(lastScheduledDate, 1);
  return {
    startDate,
    endDate: addIsoDays(startDate, Math.max(1, days) - 1),
  };
}

export type ResignationAssetEvidence = {
  case_id: string;
  asset_identifier: string;
  asset_type_label: string;
  recovery_status: string;
  release_trigger_status: string;
};

export type ResignationNotificationPayload = {
  workflow_id: string;
  company_slug: string;
  company_name: string;
  employee_name: string;
  notice_date: string;
  last_scheduled_date: string;
  separation_date: string;
  recipients: string[];
  repaint_evidence: Record<string, unknown> | null;
  assets: ResignationAssetEvidence[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildResignationCompletionEmail(
  payload: ResignationNotificationPayload,
  workflowUrl?: string | null
) {
  const generatedCount = Number(payload.repaint_evidence?.generated_count ?? 0);
  const overrideCount = Number(payload.repaint_evidence?.override_count ?? 0);
  const assetRows = payload.assets.length
    ? payload.assets.map((asset) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(asset.asset_type_label)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(asset.asset_identifier)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(asset.release_trigger_status)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(asset.case_id)}</td>
      </tr>`).join("")
    : '<tr><td colspan="4" style="padding:8px;color:#64748b">No assigned assets required a release trigger.</td></tr>';

  const subject = `Resignation workflow completed — ${payload.employee_name}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px;margin:auto">
      <p style="color:#2563eb;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Resignation workflow evidence</p>
      <h1 style="margin:0 0 8px">${escapeHtml(payload.employee_name)}</h1>
      <p style="color:#475569">The scheduled separation workflow is complete.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Notice submitted</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(payload.notice_date)}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Last day on schedule</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(payload.last_scheduled_date)}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Separation effective</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(payload.separation_date)}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Schedule repaint</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${generatedCount} rows · ${overrideCount} override rows</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Roster</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>Former</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Workflow ID</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.workflow_id)}</td></tr>
      </table>
      <h2 style="font-size:18px">Asset release and recovery</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="padding:8px;text-align:left">Type</th><th style="padding:8px;text-align:left">Asset</th><th style="padding:8px;text-align:left">Release trigger</th><th style="padding:8px;text-align:left">Recovery case</th></tr></thead>
        <tbody>${assetRows}</tbody>
      </table>
      <p style="padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412">
        Asset recovery is non-blocking. Physical verification is required to close each open recovery case. Assigning an asset to a new driver automatically confirms recovery, reconciles the case, and preserves the new assignment.
      </p>
      ${workflowUrl ? `<p><a href="${escapeHtml(workflowUrl)}" style="color:#2563eb;font-weight:700">Open the workflow audit record</a></p>` : ""}
    </div>`;

  return { subject, html };
}
