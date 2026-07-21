"use client";

import { useMemo, useState } from "react";

type Company = { id: string; company_slug: string; company_name: string | null };
type Template = {
  id: string;
  template_name: string;
  default_payload_json: Record<string, any> | null;
};

function targetsFor(template: Template | undefined) {
  const targets = template?.default_payload_json?.targets;
  return Array.isArray(targets) ? targets : [];
}

function targetedRecoveryDateBounds() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const earliest = new Date(`${today}T12:00:00Z`);
  const latest = new Date(`${today}T12:00:00Z`);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1);
  latest.setUTCDate(latest.getUTCDate() - 1);

  return {
    min: earliest.toISOString().slice(0, 10),
    max: latest.toISOString().slice(0, 10),
  };
}

function ExecutionForm({
  mode,
  companies,
  templates,
  action,
}: {
  mode: "HISTORICAL_BACKFILL" | "TARGETED_RECOVERY";
  companies: Company[];
  templates: Template[];
  action: (formData: FormData) => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = useMemo(
    () => templates.find((item) => item.id === templateId),
    [templateId, templates]
  );
  const targets = targetsFor(template);
  const historical = mode === "HISTORICAL_BACKFILL";
  const targetedBounds = targetedRecoveryDateBounds();

  return (
    <form action={action} className="automation-live-execution-form">
      <input type="hidden" name="requestType" value={mode} />
      <div className="automation-live-execution-heading">
        <div>
          <span className="workspace-eyebrow">Live execution</span>
          <h3>{historical ? "Historical Sweep" : "Targeted Recovery"}</h3>
          <p>{historical ? "Collect an exact inclusive historical range now." : "Recover one missing artifact for one exact service date now."}</p>
        </div>
        <span className="automation-ticket-state is-published">On demand</span>
      </div>

      {templates.length === 0 ? (
        <div className="automation-library-empty">Publish a {historical ? "Historical Backfill" : "Targeted Recovery"} ticket before launching this event.</div>
      ) : (
        <>
          <div className="automation-live-execution-grid">
            <label><span>Company</span><select name="companyId" required defaultValue=""><option value="" disabled>Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name || company.company_slug}</option>)}</select></label>
            <label><span>Published instruction</span><select name="templateId" required value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{item.template_name}</option>)}</select></label>
            <label><span>File to gather</span><select name="targetKey" required defaultValue={targets[0]?.key ?? ""} key={templateId}><option value="" disabled>Select file</option>{targets.map((target: any) => <option key={String(target.key)} value={String(target.key)}>{String(target.label ?? target.key)}</option>)}</select></label>
            {historical ? (
              <><label><span>Range begins</span><input name="serviceDateStart" type="date" required /></label><label><span>Range ends</span><input name="serviceDateEnd" type="date" required /></label></>
            ) : (
              <label>
                <span>Service date · prior 12 months only</span>
                <input name="serviceDate" type="date" min={targetedBounds.min} max={targetedBounds.max} required />
              </label>
            )}
          </div>
          <div className="automation-live-execution-actions"><p>The published instruction governs runner behavior. These fields govern this execution only.</p><button type="submit" className="automation-action-button automation-action-button--primary">Launch now</button></div>
        </>
      )}
    </form>
  );
}

export default function LiveExecutionPortals(props: {
  companies: Company[];
  templates: Template[];
  launchAction: (formData: FormData) => void;
}) {
  const historical = props.templates.filter((template) => template.default_payload_json?.request_type === "HISTORICAL_BACKFILL");
  const targeted = props.templates.filter((template) => template.default_payload_json?.request_type === "TARGETED_RECOVERY");
  return (
    <section className="automation-live-execution">
      <div className="automation-workbench-heading"><div><span className="workspace-eyebrow">Execution terminal</span><h2>Launch governed collection</h2><p>Issue an à la carte request without changing the automation ticket or its company schedule.</p></div></div>
      <div className="automation-live-execution-portals">
        <ExecutionForm mode="HISTORICAL_BACKFILL" companies={props.companies} templates={historical} action={props.launchAction} />
        <ExecutionForm mode="TARGETED_RECOVERY" companies={props.companies} templates={targeted} action={props.launchAction} />
      </div>
    </section>
  );
}
