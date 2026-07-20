"use client";

import { useMemo, useState } from "react";
import { OPERATIONS_COLLECTION_PAYLOAD_VERSION, runnerGoalForRequestType } from "@/features/automation/contracts/runnerGoal";

type Template = {
  id: string;
  template_key: string;
  template_name: string;
  ticket_family: string;
  description: string | null;
  default_priority: number;
  default_collection_mode: string | null;
  default_payload_json: Record<string, any> | null;
  is_active: boolean;
  updated_at: string;
};

const REPORTS = [
  ["DSW", "Daily Service Worksheet"],
  ["FCC", "Service Area Summary"],
  ["DELIVERY_MANIFEST", "Delivery manifests"],
  ["PICKUP_MANIFEST", "Pickup manifests"],
] as const;

const TARGETS: Record<string, Record<string, unknown>> = {
  DSW: { key: "DSW_DAILY_SERVICE", label: "DSW · Daily Service Worksheet", artifact_key: "DSW", report_family_key: "DSW", runner_section: "DAILY_SERVICE", vps_target: 11, expected_filename_match: ["daily service worksheet"] },
  FCC: { key: "SERVICE_AREA_SUMMARY", label: "FCC · SA Summary", artifact_key: "SERVICE_AREA_SUMMARY", report_family_key: "FCC", runner_section: "SERVICE", vps_target: 6, expected_filename_match: ["ServiceAreaSummary", "SASummary_"] },
  DELIVERY_MANIFEST: { key: "P_AND_D_DELIVERY_MANIFEST", label: "P&D · Delivery Manifest", artifact_key: "DELIVERY_MANIFEST", report_family_key: "FCC", runner_section: "P_AND_D", vps_target: 2, expected_filename_match: ["DeliveryManifest"] },
  PICKUP_MANIFEST: { key: "P_AND_D_PICKUP_MANIFEST", label: "P&D · Pickup Manifest", artifact_key: "PICKUP_MANIFEST", report_family_key: "FCC", runner_section: "P_AND_D", vps_target: 1, expected_filename_match: ["PickupManifest", "PM"] },
};

function emptyDraft() {
  return {
    id: "", name: "", key: "", purpose: "", requestType: "PREVIOUS_DAY_CLOSE",
    dateMode: "YESTERDAY", reports: ["DSW"], priority: 60, retry: "MANUAL_AFTER_FAILURE",
    success: "Every requested artifact is stored and accepted by its ingestion engine.", published: false,
  };
}

function fromTemplate(template: Template) {
  const payload = template.default_payload_json ?? {};
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const reports = targets.map((target: any) => target?.artifact_key).filter(Boolean);
  return {
    id: template.id,
    name: template.template_name,
    key: template.template_key,
    purpose: template.description ?? "",
    requestType: String(payload.request_type ?? "OPERATIONS_PULSE"),
    dateMode: String(payload.date_mode ?? template.default_collection_mode ?? "TODAY"),
    reports: reports.length ? reports : ["DSW"],
    priority: template.default_priority,
    retry: String(payload.retry_policy ?? "MANUAL_AFTER_FAILURE"),
    success: String(payload.success_statement ?? "Every requested artifact is stored and accepted by its ingestion engine."),
    published: template.is_active,
  };
}

function keyFromName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64);
}

export default function AutomationWorkbench({ templates, saveAction }: { templates: Template[]; saveAction: (data: FormData) => void }) {
  const [draft, setDraft] = useState(emptyDraft());
  const compiled = useMemo(() => ({
    payload_contract_version: OPERATIONS_COLLECTION_PAYLOAD_VERSION,
    source: "teamoptix_automation_workbench",
    request_type: draft.requestType,
    date_mode: draft.dateMode,
    intent: draft.purpose,
    runner_goal: runnerGoalForRequestType(draft.requestType),
    runner_goal_label: draft.name || "Untitled work instruction",
    collect_scope: draft.reports.join("+").toLowerCase(),
    retry_policy: draft.retry,
    success_statement: draft.success,
    targets: draft.reports.map((key) => TARGETS[key]).filter(Boolean),
  }), [draft]);

  const dateLanguage = draft.dateMode === "YESTERDAY" ? "the previous service day" : draft.dateMode === "TODAY" ? "the current service day" : draft.dateMode === "SELECTED_DATE" ? "one selected service date" : "a selected historical date range";
  const reportLanguage = draft.reports.map((key) => REPORTS.find(([value]) => value === key)?.[1]).filter(Boolean).join(", ");

  return <div className="automation-workbench-stack">
    <section className="automation-workbench-terminal">
      <div className="automation-workbench-heading">
        <div><span className="workspace-eyebrow">Authoring terminal</span><h2>{draft.id ? `Edit ${draft.name}` : "Create a work instruction"}</h2><p>Describe the operational outcome. Insight compiles the runner contract behind the scenes.</p></div>
        {draft.id && <button className="secondary-action" type="button" onClick={() => setDraft(emptyDraft())}>New ticket</button>}
      </div>
      <form action={saveAction} className="automation-workbench-form">
        <input type="hidden" name="templateId" value={draft.id} />
        <input type="hidden" name="templateKey" value={draft.key || keyFromName(draft.name)} />
        <input type="hidden" name="payload" value={JSON.stringify(compiled)} />
        <input type="hidden" name="reports" value={draft.reports.join(",")} />
        <div className="automation-workbench-grid">
          <label><span>What should this ticket be called?</span><input name="templateName" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Previous Day Close" /></label>
          <label><span>What job does it perform?</span><select name="requestType" value={draft.requestType} onChange={(e) => setDraft({ ...draft, requestType: e.target.value })}><option value="PREVIOUS_DAY_CLOSE">Close the previous day</option><option value="OPERATIONS_PULSE">Refresh current operations</option><option value="LAST_LOOK">Run the final same-day look</option><option value="HISTORICAL_BACKFILL">Recover historical records</option><option value="TARGETED_RECOVERY">Recover a specific missing item</option></select></label>
          <label className="automation-workbench-wide"><span>Why does this instruction exist?</span><textarea name="description" required rows={2} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} placeholder="Protect the previous day's finalized operating record." /></label>
          <label><span>Which business period?</span><select name="dateMode" value={draft.dateMode} onChange={(e) => setDraft({ ...draft, dateMode: e.target.value })}><option value="YESTERDAY">Yesterday only</option><option value="TODAY">Today</option><option value="SELECTED_DATE">One selected date</option><option value="SELECTED_RANGE">Selected historical range</option></select></label>
          <label><span>Priority</span><select name="priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}><option value="40">Urgent recovery</option><option value="60">Protected daily close</option><option value="100">Normal</option><option value="150">Background</option></select></label>
        </div>
        <fieldset className="automation-workbench-reports"><legend>What should the runner collect?</legend>{REPORTS.map(([key, title]) => <label key={key}><input type="checkbox" checked={draft.reports.includes(key)} onChange={(e) => setDraft({ ...draft, reports: e.target.checked ? [...draft.reports, key] : draft.reports.filter((item) => item !== key) })} /> <span>{title}</span></label>)}</fieldset>
        <div className="automation-workbench-grid">
          <label><span>After a failed attempt</span><select name="retryPolicy" value={draft.retry} onChange={(e) => setDraft({ ...draft, retry: e.target.value })}><option value="MANUAL_AFTER_FAILURE">Stop and require review</option><option value="RETRY_ONCE">Retry once</option><option value="RETRY_IN_WINDOW">Retry during its operating window</option></select></label>
          <label className="automation-workbench-wide"><span>What proves success?</span><textarea name="successStatement" rows={2} value={draft.success} onChange={(e) => setDraft({ ...draft, success: e.target.value })} /></label>
        </div>
        <div className="automation-compiled-preview"><span className="workspace-eyebrow">Compiled instruction</span><p><strong>{draft.name || "This ticket"}</strong> collects {reportLanguage || "no selected reports"} for {dateLanguage}. {draft.success} {draft.retry === "MANUAL_AFTER_FAILURE" ? "A terminal failure stops automatic retries and requires review." : "The configured recovery policy may issue another attempt."}</p><details><summary>View runner payload</summary><pre>{JSON.stringify(compiled, null, 2)}</pre></details></div>
        <div className="automation-workbench-actions"><label className="automation-publish-toggle"><input type="checkbox" name="isActive" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} /> Published and available for assignment</label><button className="primary-action" type="submit">{draft.id ? "Save new revision" : "Save ticket"}</button></div>
      </form>
    </section>

    <section className="automation-ticket-library">
      <div className="automation-workbench-heading"><div><span className="workspace-eyebrow">Ticket library</span><h2>{templates.length} saved instruction{templates.length === 1 ? "" : "s"}</h2><p>Select a record to load it into the authoring terminal.</p></div></div>
      <div className="automation-library-list">{templates.length === 0 ? <div className="automation-library-empty">No saved tickets.</div> : templates.map((template) => { const payload = template.default_payload_json ?? {}; const targets = Array.isArray(payload.targets) ? payload.targets : []; return <article className="automation-library-record" key={template.id}>
        <div className="automation-library-record__identity"><span className={`automation-ticket-state ${template.is_active ? "is-published" : ""}`}>{template.is_active ? "Published" : "Draft"}</span><h3>{template.template_name}</h3><code>{template.template_key}</code><p>{template.description || "No purpose statement recorded."}</p></div>
        <dl className="automation-library-record__facts"><div><dt>Business period</dt><dd>{String(payload.date_mode ?? template.default_collection_mode ?? "Not defined").replaceAll("_", " ")}</dd></div><div><dt>Collection</dt><dd>{targets.map((target: any) => target.label).filter(Boolean).join(" · ") || "No targets defined"}</dd></div><div><dt>Failure behavior</dt><dd>{String(payload.retry_policy ?? "Not defined").replaceAll("_", " ")}</dd></div><div><dt>Priority</dt><dd>{template.default_priority}</dd></div></dl>
        <button type="button" className="automation-action-button automation-action-button--secondary automation-library-open" onClick={() => { setDraft(fromTemplate(template)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Open in workbench</button>
      </article>; })}</div>
    </section>
  </div>;
}
