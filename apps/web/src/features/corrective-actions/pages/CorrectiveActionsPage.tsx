"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { renderCanStatement, splitStopReferences } from "../lib/composeCorrectiveAction";
import type { CorrectiveActionDraft, CorrectiveActionTemplate, CorrectiveActionWorkspace } from "../types";

const fieldStyle = { width: "100%", minHeight: 42, padding: "9px 11px", border: "1px solid #d6dfeb", borderRadius: 10, background: "#fff", font: "inherit" } as const;
const today = () => new Date().toISOString().slice(0, 10);

const policyAreaLabels: Record<string, string> = {
  ATTENDANCE: "Attendance",
  SERVICE: "Delivery & service",
  PERFORMANCE: "Performance",
  SAFETY: "Safety",
  CONDUCT: "Conduct",
  POLICY: "Company policy",
  GENERAL: "Other",
};

const evidenceLabels: Record<string, string> = {
  DSW: "Daily service record",
  DISPATCH_EVENT: "Dispatch activity",
  CAN_HISTORY: "Prior corrective actions",
  COMMUNICATION_LOG: "Manager communication",
  PACKAGE_STATUS: "Package status",
  PPOD: "Delivery photos",
  INCIDENT_REPORT: "Incident report",
  VEDR: "Vehicle camera",
  CUSTOMER_EVIDENCE: "Customer evidence",
  FLEET_RECORD: "Vehicle record",
  FLEET_INSPECTION: "Vehicle inspection",
  TELEMATICS: "Vehicle safety data",
};

function sentenceCase(value: string) {
  const normalized = value.replaceAll("_", " ").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function emptyDraft(rosterId = "", incidentDate = today()): CorrectiveActionDraft {
  return { roster_id: rosterId, template_id: "", category_label: "", title: "", warning_level: "COACHING", outcome_type: "NONE", incident_date: incidentDate, record_date: today(), facts_statement: "", expectation_statement: "", action_statement: "", corrective_plan: "", employee_response: "", policy_reference: "", suspension_start: "", suspension_end: "", occurrences: [{ occurred_at: `${incidentDate}T12:00`, route_label: "", stop_references: [], context_note: "", source_kind: "MANUAL" }] };
}

function Field(props: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800, color: "#475569" }}><span>{props.label}</span>{props.children}</label>;
}

type EvidenceRoute = {
  key: string;
  route_label: string;
  driver_name: string | null;
  roster_id: string | null;
  roster_name: string | null;
  code_85_count: number;
  planned_delivery_stops: number;
  actual_delivery_stops: number;
  actual_delivery_packages: number;
  planned_pickup_stops: number;
  actual_pickup_stops: number;
  actual_pickup_packages: number;
  exceptions: number;
  dna_count: number;
  send_again_count: number;
  non_delivered_stops: number;
  all_status_code_packages: number;
  required_signature_count: number;
  potential_missed_pickups: number;
  early_late_pickups: number;
  miles: number | null;
  on_road_hours: string | number | null;
  on_duty_hours: string | number | null;
  vehicle_text: string | null;
  code_counts: Record<string, number>;
  code_instances: Array<{ id: string; tracking_ref: string; vision_label: string | null; vehicle_number: string | null; vsa_status_code: string | null; star_status_code: string | null; star_scan_at_local: string | null }>;
  source: string;
  source_id: string | null;
};

type AttendanceEvidence = { last_attendance_can_date: string | null; events: Array<{ id: string; date: string; event_code: string; event_label: string; note: string | null; created_at: string }> };

export default function CorrectiveActionsPage() {
  const slug = String(useParams()?.slug ?? "");
  const search = useSearchParams();
  const [workspace, setWorkspace] = useState<CorrectiveActionWorkspace | null>(null);
  const [draft, setDraft] = useState<CorrectiveActionDraft>(() => emptyDraft(search.get("rosterId") ?? "", search.get("incidentDate") ?? today()));
  const [open, setOpen] = useState(Boolean(search.get("rosterId") || search.get("source")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<CorrectiveActionTemplate | null>(null);
  const [evidenceRoutes, setEvidenceRoutes] = useState<EvidenceRoute[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState("");
  const [attendanceEvidence, setAttendanceEvidence] = useState<AttendanceEvidence>({ last_attendance_can_date: null, events: [] });

  const load = useCallback(async () => {
    const response = await fetch(`/api/company/${slug}/people/corrective-actions`, { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load corrective actions.");
    setWorkspace(data);
  }, [slug]);

  useEffect(() => { if (slug) load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load corrective actions.")); }, [load, slug]);

  useEffect(() => {
    const source = search.get("source");
    const rosterId = search.get("rosterId") ?? "";
    if (!source && !rosterId) return;
    const incidentDate = search.get("incidentDate") ?? today();
    setDraft((current) => ({
      ...current,
      roster_id: rosterId || current.roster_id,
      incident_date: incidentDate,
      occurrences: current.occurrences.map((occurrence, index) => index === 0 ? { ...occurrence, occurred_at: `${incidentDate}T12:00` } : occurrence),
    }));
    setStudioOpen(false);
    setOpen(true);
  }, [search]);

  useEffect(() => {
    if (!open || !slug || !draft.incident_date) return;
    let active = true;
    setEvidenceLoading(true);
    fetch(`/api/company/${slug}/people/corrective-actions/evidence?date=${draft.incident_date}${draft.roster_id ? `&rosterId=${draft.roster_id}` : ""}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Unable to load operational evidence.");
        return body;
      })
      .then((body) => { if (active) { setEvidenceRoutes(Array.isArray(body?.routes) ? body.routes : []); setAttendanceEvidence(body?.attendance && Array.isArray(body.attendance.events) ? body.attendance : { last_attendance_can_date: null, events: [] }); } })
      .catch(() => { if (active) { setEvidenceRoutes([]); setAttendanceEvidence({ last_attendance_can_date: null, events: [] }); } })
      .finally(() => { if (active) setEvidenceLoading(false); });
    return () => { active = false; };
  }, [draft.incident_date, draft.roster_id, open, slug]);

  useEffect(() => {
    if (!open || evidenceLoading || !draft.roster_id) return;
    const route = evidenceRoutes.find((item) => item.roster_id === draft.roster_id);
    if (route) {
      if (selectedEvidenceKey === route.key) return;
      setSelectedEvidenceKey(route.key);
      setDraft((current) => ({
        ...current,
        occurrences: current.occurrences.map((occurrence, index) => index === 0 ? {
          ...occurrence,
          route_label: route.route_label,
          source_kind: "DSW",
          source_id: route.source_id,
          context_note: `DSW daily route record · ${route.actual_delivery_stops} delivery stops · ${route.actual_delivery_packages} delivery packages · ${route.actual_pickup_stops} pickup stops · ${route.actual_pickup_packages} pickup packages · ${route.exceptions} exceptions · Code 85 ${route.code_85_count} · DNA ${route.dna_count} · Send Again ${route.send_again_count}${route.miles == null ? "" : ` · ${route.miles} miles`}`,
        } : occurrence),
      }));
      return;
    }
    if (selectedEvidenceKey) {
      setSelectedEvidenceKey("");
      setDraft((current) => ({
        ...current,
        occurrences: current.occurrences.map((occurrence, index) => index === 0 && occurrence.source_kind === "DSW" ? { ...occurrence, route_label: "", source_kind: "MANUAL", source_id: null, context_note: "" } : occurrence),
      }));
    }
  }, [draft.roster_id, evidenceLoading, evidenceRoutes, open, selectedEvidenceKey]);

  const employee = useMemo(() => workspace?.roster.find((person) => person.id === draft.roster_id), [draft.roster_id, workspace]);
  const policyTemplates = useMemo(() => (workspace?.templates ?? []).filter((template) => Boolean(template.selection_help)), [workspace]);
  const availableTemplates = useMemo(() => {
    const specific = policyTemplates;
    const fallback = (workspace?.templates ?? []).find((template) => template.template_key === "other");
    return fallback && !specific.some((template) => template.id === fallback.id) ? [...specific, fallback] : specific;
  }, [policyTemplates, workspace]);
  const templateFamilies = useMemo(() => Array.from(new Set(policyTemplates.map((template) => template.event_family))), [policyTemplates]);
  const selectedTemplate = useMemo(() => policyTemplates.find((template) => template.id === selectedTemplateId) ?? policyTemplates[0] ?? null, [policyTemplates, selectedTemplateId]);
  const selectedEvidence = useMemo(() => evidenceRoutes.find((item) => item.key === selectedEvidenceKey) ?? null, [evidenceRoutes, selectedEvidenceKey]);
  const chooseTemplate = useCallback((template: CorrectiveActionTemplate) => {
    if (!workspace) return;
    const tokens = { employeeName: employee?.name || "the employee", companyName: workspace.company.name, incidentDate: draft.incident_date };
    setDraft((current) => ({ ...current, template_id: template.id, category_label: template.category_label, title: template.title, warning_level: template.default_warning_level || current.warning_level, outcome_type: template.default_outcome_type || current.outcome_type, facts_statement: renderCanStatement(template.facts_prompt, tokens), expectation_statement: renderCanStatement(template.expectation_statement, tokens), action_statement: renderCanStatement(template.action_statement, tokens), policy_reference: template.policy_reference || "" }));
  }, [draft.incident_date, employee?.name, workspace]);
  const evidenceSuggestions = useMemo(() => {
    const suggestions: Array<{ template: CorrectiveActionTemplate; reason: string }> = [];
    const add = (templateKey: string, reason: string) => { const template = workspace?.templates.find((item) => item.template_key === templateKey); if (template && !suggestions.some((item) => item.template.id === template.id)) suggestions.push({ template, reason }); };
    const code85 = selectedEvidence ? Math.max(selectedEvidence.code_85_count, selectedEvidence.code_counts["85"] ?? 0) : 0;
    const code27 = selectedEvidence?.code_counts["27"] ?? 0;
    if (code85 > 0) add("service_code_85", `${code85} Code 85 package instance${code85 === 1 ? "" : "s"} recorded`);
    if (code27 > 0) add("service_code_27", `${code27} Code 27 package instance${code27 === 1 ? "" : "s"} recorded`);
    if ((selectedEvidence?.potential_missed_pickups ?? 0) > 0 || (selectedEvidence?.early_late_pickups ?? 0) > 0) add("pickup_window", `${selectedEvidence?.potential_missed_pickups ?? 0} potentially missed and ${selectedEvidence?.early_late_pickups ?? 0} early/late pickup events`);
    if ((selectedEvidence?.required_signature_count ?? 0) > 0) add("delivery_signature_compliance", `${selectedEvidence?.required_signature_count ?? 0} required-signature exception${selectedEvidence?.required_signature_count === 1 ? "" : "s"}`);
    if ((selectedEvidence?.non_delivered_stops ?? 0) > 0) add("performance_incomplete_route", `${selectedEvidence?.non_delivered_stops ?? 0} non-delivered stop${selectedEvidence?.non_delivered_stops === 1 ? "" : "s"}`);
    if (attendanceEvidence.events.length) {
      const noShows = attendanceEvidence.events.filter((event) => event.event_code === "NO_SHOW").length;
      if (noShows) add("attendance_ncns", `${noShows} no-call/no-show event${noShows === 1 ? "" : "s"} since the last attendance CAN`);
      else if (attendanceEvidence.events.length > 1) add("attendance_pattern", `${attendanceEvidence.events.length} attendance events since the last attendance CAN`);
      else add("attendance", "1 attendance event available for manager review");
    }
    return suggestions;
  }, [attendanceEvidence, selectedEvidence, workspace]);

  useEffect(() => {
    if (!draft.template_id && evidenceSuggestions.length === 1) chooseTemplate(evidenceSuggestions[0].template);
  }, [draft.template_id, evidenceSuggestions, chooseTemplate]);

  async function save(issue: boolean) {
    if (!draft.roster_id || !draft.template_id || !draft.facts_statement.trim()) { setError("Select a person and event type, then complete the facts statement."); return; }
    setSaving(true); setError(null);
    try {
      const evidenceSnapshot = { service_date: draft.incident_date, employee: employee ? { id: employee.id, name: employee.name } : null, dsw_route: selectedEvidence, attendance: attendanceEvidence, all_code_instances: selectedEvidence?.code_instances ?? [], captured_at: new Date().toISOString() };
      const response = await fetch(`/api/company/${slug}/people/corrective-actions`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, id: savedId, evidence_snapshot: evidenceSnapshot }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save the CAN.");
      setSavedId(data.id);
      if (issue) {
        const issueResponse = await fetch(`/api/company/${slug}/people/corrective-actions/${data.id}/issue`, { method: "POST", credentials: "include" });
        const issueData = await issueResponse.json();
        if (!issueResponse.ok) throw new Error(issueData?.error || "Unable to issue the CAN.");
        window.open(`/company/${slug}/people/corrective-actions/${data.id}/print`, "_blank", "noopener,noreferrer");
        setOpen(false); setSavedId(null); setDraft(emptyDraft());
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the CAN."); }
    finally { setSaving(false); }
  }

  function resetPreparation() {
    const confirmed = window.confirm("Clear this CAN form and start over? Saved and issued CAN records will not be changed.");
    if (!confirmed) return;
    setDraft(emptyDraft());
    setSavedId(null);
    setSelectedEvidenceKey("");
    setEvidenceRoutes([]);
    setAttendanceEvidence({ last_attendance_can_date: null, events: [] });
    setError(null);
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/company/${slug}/people/corrective-actions/templates`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(editingTemplate) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Unable to save company template.");
      setEditingTemplate(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save company template."); }
    finally { setSaving(false); }
  }

  return <main className="workspace-shell">
    <section className="workspace-main can-workspace">
    <nav className="can-workspace-nav" aria-label="Corrective action workspace">
      <button className={!open && !studioOpen ? "button button-primary" : "button"} type="button" onClick={() => { setOpen(false); setStudioOpen(false); }}>CAN records</button>
      <button className={open ? "button button-primary" : "button"} type="button" onClick={() => { setStudioOpen(false); setOpen(true); }}>Prepare a CAN</button>
      <button className={studioOpen ? "button button-primary" : "button"} type="button" onClick={() => { setOpen(false); setStudioOpen(true); }}>Company responses</button>
    </nav>

    {error && (!open || !workspace) ? <section className="app-card workspace-section" style={{ color: "#b91c1c" }}>{error}</section> : null}

    {studioOpen ? <section className="app-card workspace-section can-policy-studio">
      <div className="workspace-section__head"><div><p className="eyebrow">Company response guide</p><h2>Choose the event. The company response fills itself in.</h2><p className="workspace-subtitle">Review the prepared language, then use it for a CAN or change the company response.</p></div></div>
      <label className="can-policy-lookup"><span>What happened?</span><select style={fieldStyle} value={selectedTemplate?.id || ""} onChange={(event) => { setSelectedTemplateId(event.target.value); setEditingTemplate(null); }}>{templateFamilies.map((family) => <optgroup key={family} label={policyAreaLabels[family] || sentenceCase(family)}>{policyTemplates.filter((template) => template.event_family === family).map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</optgroup>)}</select><small>One selection loads the manager statement, expected standard, response, and evidence checklist.</small></label>
      <div className="can-policy-layout">
        {!selectedTemplate ? <section className="can-policy-document"><div className="can-policy-empty"><h3>No response has been set up in this area.</h3><p>Choose another policy area to review its company response.</p></div></section> : <>
          <section className="can-policy-document">
            {editingTemplate ? <div className="can-template-editor"><div><p className="eyebrow">Editing response</p><h3>{editingTemplate.title}</h3><p className="muted">Edit the starting language managers receive when this event is selected.</p></div><div className="can-template-editor__meta"><Field label="Event name"><input style={fieldStyle} value={editingTemplate.title} onChange={(event) => setEditingTemplate({ ...editingTemplate, title: event.target.value })}/></Field><Field label="Suggested starting level"><select style={fieldStyle} value={editingTemplate.default_warning_level || "COACHING"} onChange={(event) => setEditingTemplate({ ...editingTemplate, default_warning_level: event.target.value as CorrectiveActionDraft["warning_level"] })}>{["COACHING","VERBAL","WRITTEN","FINAL"].map((value) => <option key={value} value={value}>{sentenceCase(value)}</option>)}</select></Field></div><Field label="Use this response when"><textarea style={fieldStyle} rows={2} value={editingTemplate.selection_help || ""} onChange={(event) => setEditingTemplate({ ...editingTemplate, selection_help: event.target.value })}/></Field><Field label="Manager statement"><textarea style={fieldStyle} rows={5} value={editingTemplate.facts_prompt} onChange={(event) => setEditingTemplate({ ...editingTemplate, facts_prompt: event.target.value })}/></Field><Field label="Expected standard"><textarea style={fieldStyle} rows={4} value={editingTemplate.expectation_statement} onChange={(event) => setEditingTemplate({ ...editingTemplate, expectation_statement: event.target.value })}/></Field><Field label="Company response"><textarea style={fieldStyle} rows={4} value={editingTemplate.action_statement} onChange={(event) => setEditingTemplate({ ...editingTemplate, action_statement: event.target.value })}/></Field><Field label="Policy reference"><input style={fieldStyle} value={editingTemplate.policy_reference || ""} onChange={(event) => setEditingTemplate({ ...editingTemplate, policy_reference: event.target.value })}/></Field><div className="cta-row"><button className="button button-primary" disabled={saving} onClick={() => void saveTemplate()}>{saving ? "Saving…" : "Save changes"}</button><button className="button" type="button" onClick={() => setEditingTemplate(null)}>Cancel</button></div></div> : <><header className="can-policy-document__head"><p className="eyebrow">Company response</p><h3>{selectedTemplate.title}</h3><p>{selectedTemplate.selection_help}</p></header><div className="can-policy-response"><div><span>Manager statement</span><p>{renderCanStatement(selectedTemplate.facts_prompt, { employeeName: "the selected employee", companyName: workspace?.company.name || "the company", incidentDate: "the incident date" })}</p></div><div><span>Expected standard</span><p>{renderCanStatement(selectedTemplate.expectation_statement, { employeeName: "the selected employee", companyName: workspace?.company.name || "the company", incidentDate: "the incident date" })}</p></div><div><span>Company response</span><p>{renderCanStatement(selectedTemplate.action_statement, { employeeName: "the selected employee", companyName: workspace?.company.name || "the company", incidentDate: "the incident date" })}</p></div></div></>}
          </section>
          <aside className="can-policy-inspector">
            <section><p className="eyebrow">Starting point</p><strong className="can-policy-level">{sentenceCase(selectedTemplate.default_warning_level || "COACHING")}</strong><p className="muted">The manager makes the final decision for each CAN.</p></section>
            <section><p className="eyebrow">Evidence to review</p>{(selectedTemplate.evidence_sources || []).length ? <div className="can-policy-evidence-list">{(selectedTemplate.evidence_sources || []).map((source) => <span key={source}>{evidenceLabels[source] || sentenceCase(source)}</span>)}</div> : <p className="muted">No standard evidence source selected.</p>}</section>
            <section className="can-policy-actions"><p className="eyebrow">Next step</p><button className="button button-primary" type="button" onClick={() => { chooseTemplate(selectedTemplate); setStudioOpen(false); setOpen(true); }}>Prepare a CAN with this response</button><button className="button" type="button" onClick={() => setEditingTemplate({ ...selectedTemplate })}>Change the company response</button></section>
          </aside>
        </>}
      </div>
    </section> : null}

    {!open && !studioOpen ? <section className="app-card workspace-section"><div className="workspace-section__head"><div><p className="eyebrow">Company record</p><h2>Corrective Action Notices</h2><p className="workspace-subtitle">Draft, issued, and finalized coaching or disciplinary records for this company.</p></div></div>
      {!workspace ? <p className="muted">Loading records…</p> : workspace.actions.length === 0 ? <p className="muted">No corrective action notices have been prepared.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["CAN", "Person", "Category", "Level", "Outcome", "Status", "Incident", "Prepared by", ""].map((label) => <th key={label} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #dbe3ee", fontSize: 12 }}>{label}</th>)}</tr></thead><tbody>{workspace.actions.map((action) => <tr key={action.id}>{[action.can_number, action.employee_name, action.category_label, action.warning_level, action.outcome_type, action.workflow_status, action.incident_date, action.prepared_by].map((value, index) => <td key={index} style={{ padding: 10, borderBottom: "1px solid #edf1f6", fontSize: 13 }}>{String(value).replaceAll("_", " ")}</td>)}<td style={{ padding: 10 }}><a className="button" href={`/company/${slug}/people/corrective-actions/${action.id}/print`} target="_blank">View / print</a></td></tr>)}</tbody></table></div>}
    </section> : null}

    {open && !workspace && !error ? <section className="app-card workspace-section"><p className="eyebrow">Corrective Action Notice</p><h2>Preparing the workspace…</h2></section> : null}

    {open && workspace ? <section className="app-card workspace-section can-prep-card">
      <div className="can-prep-toolbar"><span>Prepared by {workspace.preparer?.name}</span><button className="button" type="button" disabled={saving} onClick={resetPreparation}>Reset form</button></div>
      {error ? <p style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</p> : null}
      <div className="can-prep-form">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
          <Field label="Person"><select style={fieldStyle} value={draft.roster_id} onChange={(event) => { setSelectedEvidenceKey(""); setDraft((current) => ({ ...current, roster_id: event.target.value, occurrences: current.occurrences.map((occurrence, index) => index === 0 && occurrence.source_kind === "DSW" ? { ...occurrence, route_label: "", source_kind: "MANUAL", source_id: null, context_note: "" } : occurrence) })); }}><option value="">Select person</option>{workspace.roster.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role || person.status}</option>)}</select></Field>
          <Field label="CAN reason"><select style={fieldStyle} value={draft.template_id} onChange={(event) => { const template = availableTemplates.find((item) => item.id === event.target.value); if (template) chooseTemplate(template); }}><option value="">Select manually or use recorded evidence</option>{availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.category_label} · {template.title}</option>)}</select></Field>
          <Field label="Incident date"><input style={fieldStyle} type="date" value={draft.incident_date} onChange={(event) => { setSelectedEvidenceKey(""); setDraft((current) => ({ ...current, incident_date: event.target.value, occurrences: current.occurrences.map((occurrence, index) => index === 0 ? { ...occurrence, occurred_at: `${event.target.value}T12:00`, route_label: "", context_note: "", source_kind: "MANUAL", source_id: null } : occurrence) })); }}/></Field>
          <Field label="Notice level"><select style={fieldStyle} value={draft.warning_level} onChange={(event) => setDraft((current) => ({ ...current, warning_level: event.target.value as CorrectiveActionDraft["warning_level"] }))}>{["COACHING","VERBAL","WRITTEN","FINAL"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Employment outcome"><select style={fieldStyle} value={draft.outcome_type} onChange={(event) => setDraft((current) => ({ ...current, outcome_type: event.target.value as CorrectiveActionDraft["outcome_type"] }))}>{["NONE","SUSPENSION","TERMINATION","RESIGNATION","JOB_ABANDONMENT"].map((value) => <option key={value}>{value.replaceAll("_"," ")}</option>)}</select></Field>
          <Field label="Policy reference"><input style={fieldStyle} value={draft.policy_reference} onChange={(event) => setDraft((current) => ({ ...current, policy_reference: event.target.value }))} placeholder="Adopted company policy or section"/></Field>
        </div>
        {draft.roster_id ? evidenceLoading ? <p className="can-evidence-auto">Reviewing stored route, package-code, and attendance evidence…</p> : selectedEvidence ? <section className="can-dsw-summary"><div><p className="eyebrow">Daily evidence linked automatically</p><strong>{selectedEvidence.route_label}{selectedEvidence.vehicle_text ? ` · Vehicle ${selectedEvidence.vehicle_text}` : ""}</strong></div><div className="can-dsw-summary__metrics"><span><small>Delivery</small><strong>{selectedEvidence.actual_delivery_stops} stops · {selectedEvidence.actual_delivery_packages} pkgs</strong></span><span><small>Pickups</small><strong>{selectedEvidence.actual_pickup_stops} stops · {selectedEvidence.actual_pickup_packages} pkgs</strong></span><span><small>Service</small><strong>{selectedEvidence.exceptions} exceptions · {selectedEvidence.code_85_count} Code 85</strong></span><span><small>All Code instances</small><strong>{Object.keys(selectedEvidence.code_counts).length ? Object.entries(selectedEvidence.code_counts).map(([code,count]) => `${code}: ${count}`).join(" · ") : "None recorded"}</strong></span><span><small>Route time</small><strong>{selectedEvidence.miles == null ? "Miles —" : `${selectedEvidence.miles} miles`} · {selectedEvidence.on_road_hours ?? "—"} road hrs</strong></span></div></section> : <p className="can-evidence-auto">No stored DSW route matched this person and date. Attendance evidence and manual occurrence entry remain available.</p> : null}
        {attendanceEvidence.events.length ? <section className="can-attendance-evidence"><div><p className="eyebrow">Attendance history since last attendance CAN</p><strong>{attendanceEvidence.events.length} recorded event{attendanceEvidence.events.length === 1 ? "" : "s"}</strong></div><div>{attendanceEvidence.events.map((event) => <span key={event.id}>{event.date} · {event.event_label}</span>)}</div></section> : null}
        {evidenceSuggestions.length ? <section className="can-evidence-suggestions"><div><p className="eyebrow">Recorded issues available for review</p><strong>{evidenceSuggestions.length === 1 ? "Insight selected the supported CAN reason." : "Choose the issue this CAN should address."}</strong></div><div>{evidenceSuggestions.map((suggestion) => <button className={draft.template_id === suggestion.template.id ? "can-evidence-suggestion is-selected" : "can-evidence-suggestion"} key={suggestion.template.id} type="button" onClick={() => chooseTemplate(suggestion.template)}><strong>{suggestion.template.title}</strong><span>{suggestion.reason}</span></button>)}</div></section> : null}
        {draft.outcome_type === "SUSPENSION" ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Field label="Suspension begins"><input style={fieldStyle} type="date" value={draft.suspension_start} onChange={(event) => setDraft((current) => ({ ...current, suspension_start: event.target.value }))}/></Field><Field label="Suspension ends"><input style={fieldStyle} type="date" value={draft.suspension_end} onChange={(event) => setDraft((current) => ({ ...current, suspension_end: event.target.value }))}/></Field></div> : null}
        <Field label="Objective facts and evidence"><textarea style={fieldStyle} rows={5} value={draft.facts_statement} onChange={(event) => setDraft((current) => ({ ...current, facts_statement: event.target.value }))}/></Field>
        <Field label="Expected standard"><textarea style={fieldStyle} rows={3} value={draft.expectation_statement} onChange={(event) => setDraft((current) => ({ ...current, expectation_statement: event.target.value }))}/></Field>
        <Field label="Leadership response"><textarea style={fieldStyle} rows={3} value={draft.action_statement} onChange={(event) => setDraft((current) => ({ ...current, action_statement: event.target.value }))}/></Field>
        <Field label="Corrective plan, training, or follow-up"><textarea style={fieldStyle} rows={3} value={draft.corrective_plan} onChange={(event) => setDraft((current) => ({ ...current, corrective_plan: event.target.value }))} placeholder="Specific support, retraining, measurement, and follow-up date"/></Field>
        <section className="app-card" style={{ padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>Occurrences and physical evidence context</strong><button className="button" type="button" onClick={() => setDraft((current) => ({ ...current, occurrences: [...current.occurrences, { occurred_at: `${current.incident_date}T12:00`, route_label: "", stop_references: [], context_note: "", source_kind: "MANUAL" }] }))}>Add occurrence</button></div>{draft.occurrences.map((occurrence, index) => <div key={index} style={{ paddingTop: 10, marginTop: 10, borderTop: index ? "1px solid #dbe3ee" : "none" }}>{occurrence.source_kind === "DSW" ? <div className="can-occurrence-source"><span>Stored DSW route</span><button className="button" type="button" onClick={() => { setSelectedEvidenceKey(""); setDraft((current) => ({ ...current, occurrences: current.occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, source_kind: "MANUAL", source_id: null, context_note: "" } : item) })); }}>Use manual entry instead</button></div> : null}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}><Field label={`Occurred at · ${index + 1}`}><input style={fieldStyle} type="datetime-local" value={occurrence.occurred_at} onChange={(event) => setDraft((current) => ({ ...current, occurrences: current.occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, occurred_at: event.target.value } : item) }))}/></Field><Field label="Route"><input style={{ ...fieldStyle, background: occurrence.source_kind === "DSW" ? "#f3f6fa" : "#fff" }} readOnly={occurrence.source_kind === "DSW"} value={occurrence.route_label} onChange={(event) => setDraft((current) => ({ ...current, occurrences: current.occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, route_label: event.target.value } : item) }))} placeholder="Route name or number"/></Field><Field label="Stops / package references"><input style={fieldStyle} value={occurrence.stop_references.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, occurrences: current.occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, stop_references: splitStopReferences(event.target.value) } : item) }))} placeholder="12, 18, 22"/></Field></div><Field label={occurrence.source_kind === "DSW" ? "Manager context or additional evidence" : "Occurrence context"}><textarea style={{ ...fieldStyle, marginTop: 10 }} rows={2} value={occurrence.context_note} onChange={(event) => setDraft((current) => ({ ...current, occurrences: current.occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, context_note: event.target.value } : item) }))} placeholder="Link the event to dispatch, delivery, service, or other evidence"/></Field>{draft.occurrences.length > 1 ? <button className="button" type="button" style={{ marginTop: 8 }} onClick={() => setDraft((current) => ({ ...current, occurrences: current.occurrences.filter((_, itemIndex) => itemIndex !== index) }))}>Remove occurrence</button> : null}</div>)}</section>
        <div className="cta-row"><button className="button" disabled={saving} onClick={() => void save(false)}>{saving ? "Saving…" : "Save draft"}</button><button className="button button-primary" disabled={saving} onClick={() => void save(true)}>Issue and open print view</button><button className="button" onClick={() => setOpen(false)}>Cancel</button></div>
      </div>
    </section> : null}
    </section>
  </main>;
}
