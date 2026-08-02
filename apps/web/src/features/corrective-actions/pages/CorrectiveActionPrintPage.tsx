"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type RecordData = {
  company: { name: string; slug: string };
  action: Record<string, any>;
  employee: { name: string; role: string | null };
  preparer: { name: string };
  occurrences: Array<Record<string, any>>;
  evidence: Array<Record<string, any>>;
  acknowledgments: Array<Record<string, any>>;
};

function Line(props: { label: string; value?: string | null }) {
  return <div className="can-line"><span>{props.label}</span><strong>{props.value || "—"}</strong></div>;
}

export default function CorrectiveActionPrintPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const actionId = String(params?.actionId ?? "");
  const [data, setData] = useState<RecordData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [agreement, setAgreement] = useState<"AGREES" | "DISAGREES" | "NO_SELECTION">("NO_SELECTION");
  const [writtenResponse, setWrittenResponse] = useState(false);
  const [comment, setComment] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [signerName, setSignerName] = useState("");

  useEffect(() => {
    fetch(`/api/company/${slug}/people/corrective-actions/${actionId}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body?.error || "Unable to load CAN."); return body; })
      .then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load CAN."));
  }, [actionId, refreshKey, slug]);

  async function recordEmployeeStatement() {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/company/${slug}/people/corrective-actions/${actionId}/acknowledgment`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agreement_position: agreement, written_response_attached: writtenResponse, comment, session_notes: sessionNotes, signer_name: signerName, method: "MANAGER_RECORDED" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Unable to record employee statement.");
      setComment(""); setSessionNotes(""); setRefreshKey((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to record employee statement."); }
    finally { setSaving(false); }
  }

  if (error) return <main className="page-shell"><section className="panel">{error}</section></main>;
  if (!data) return <main className="page-shell"><section className="panel">Loading record…</section></main>;
  const action = data.action;
  const history = action.history_snapshot || {};
  const acknowledgment = data.acknowledgments?.at(-1) ?? null;
  const evidenceSnapshot = data.evidence?.find((item) => item.source_kind === "WAREHOUSE_SNAPSHOT")?.metadata ?? null;
  const dsw = evidenceSnapshot?.dsw_route ?? null;
  const attendanceEvents = Array.isArray(evidenceSnapshot?.attendance?.events) ? evidenceSnapshot.attendance.events : [];
  const codeInstances = Array.isArray(evidenceSnapshot?.all_code_instances) ? evidenceSnapshot.all_code_instances : [];

  return <main className="can-print-shell">
    <div className="can-print-toolbar"><a className="button" href={`/company/${slug}/people/corrective-actions`}>Back to records</a><button className="button button-primary" onClick={() => window.print()}>Print / Save PDF</button></div>
    <section className="can-ack-editor">
      <div><p className="eyebrow">Post-issuance event</p><h2>Employee statement and 1-on-1 session</h2><p className="muted">Record the employee’s position after the manager has issued and reviewed this notice. Each submission is retained as a timestamped acknowledgment event.</p></div>
      <div className="can-ack-choice"><label><input type="radio" name="agreement" checked={agreement === "AGREES"} onChange={() => setAgreement("AGREES")}/> I agree with the manager statement</label><label><input type="radio" name="agreement" checked={agreement === "DISAGREES"} onChange={() => setAgreement("DISAGREES")}/> I disagree with the manager statement</label><label><input type="checkbox" checked={writtenResponse} onChange={(event) => setWrittenResponse(event.target.checked)}/> Written response attached or placed on reverse</label></div>
      <div className="can-ack-editor-grid"><label>Employee name<input value={signerName} onChange={(event) => setSignerName(event.target.value)} placeholder={data.employee.name}/></label><label>Employee comment<textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional employee statement"/></label><label>1-on-1 session notes<textarea rows={3} value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder="Coaching discussion, call-out context, or other session notes"/></label></div>
      <button className="button button-primary" disabled={saving} onClick={() => void recordEmployeeStatement()}>{saving ? "Recording…" : "Record employee statement"}</button>
    </section>
    <article className="can-document">
      <header className="can-document__header"><div><p>CORRECTIVE ACTION NOTICE</p><h1>{data.company.name}</h1></div><div className="can-number">CAN #{action.can_number}<small>{action.workflow_status}</small></div></header>
      <section className="can-grid can-grid--four"><Line label="Team member" value={data.employee.name}/><Line label="Role" value={data.employee.role}/><Line label="Incident date" value={action.incident_date}/><Line label="Record date" value={action.record_date}/><Line label="Prepared by" value={data.preparer.name}/><Line label="Category" value={action.category_label}/><Line label="Notice level" value={String(action.warning_level).replaceAll("_"," ")}/><Line label="Outcome" value={String(action.outcome_type).replaceAll("_"," ")}/></section>
      <section className="can-section"><h2>{action.title}</h2><h3>Documented facts</h3><p>{action.facts_statement}</p></section>
      {data.occurrences.length ? <section className="can-section can-context"><h3>Occurrence context</h3>{data.occurrences.map((occurrence) => <div key={occurrence.id}><strong>{new Date(occurrence.occurred_at).toLocaleString()}</strong>{occurrence.route_label ? ` · Route ${occurrence.route_label}` : ""}{occurrence.stop_references?.length ? ` · Stops ${occurrence.stop_references.join(", ")}` : ""}{occurrence.context_note ? <p>{occurrence.context_note}</p> : null}</div>)}</section> : null}
      <section className="can-section"><h3>Expected standard</h3><p>{action.expectation_statement}</p><h3>Leadership response</h3><p>{action.action_statement}</p>{action.corrective_plan ? <><h3>Corrective plan and follow-up</h3><p>{action.corrective_plan}</p></> : null}{action.policy_reference ? <p><strong>Policy reference:</strong> {action.policy_reference}</p> : null}</section>
      <section className="can-history"><strong>Prior issued record at time of issuance</strong><span>Total {history.prior_total ?? 0}</span><span>Coaching {history.prior_coaching ?? 0}</span><span>Verbal {history.prior_verbal ?? 0}</span><span>Written {history.prior_written ?? 0}</span><span>Final {history.prior_final ?? 0}</span></section>
      <section className="can-section can-employee-statement"><h3>Employee Statement</h3><div className="can-paper-checks"><span>{acknowledgment?.agreement_position === "AGREES" ? "☒" : "☐"} I AGREE with the manager statement</span><span>{acknowledgment?.agreement_position === "DISAGREES" ? "☒" : "☐"} I DISAGREE with the manager statement</span><span>{acknowledgment?.written_response_attached ? "☒" : "☐"} Please find my written response on the back of this form. (optional)</span></div><h3>Employee comment</h3><p>{acknowledgment?.comment || ""}</p><h3>1-on-1 Session Notes</h3><p className="can-session-notes">{acknowledgment?.session_notes || ""}</p><p className="can-acknowledgment">My signature acknowledges receipt of this notice and an opportunity to respond; it does not necessarily indicate agreement with its contents.</p></section>
      <footer className="can-signatures"><div><span>Team member signature</span><i></i><small>Date / time</small></div><div><span>Manager signature</span><i></i><small>Date / time</small></div><div><span>Witness (if needed)</span><i></i><small>Date / time</small></div></footer>
      <p className="can-footer-note">Record ID {action.id} · Issued {action.issued_at ? new Date(action.issued_at).toLocaleString() : "Draft"} · Content hash {action.content_hash || "pending"}</p>
    </article>
    {evidenceSnapshot ? <article className="can-document can-evidence-appendix"><header className="can-document__header"><div><p>SUPPLEMENTAL EVIDENCE</p><h1>CAN #{action.can_number} Appendix</h1></div><div className="can-number">{data.employee.name}<small>{action.incident_date}</small></div></header><p className="can-appendix-intro">Warehouse evidence preserved with this issued notice. The CAN records the manager decision; this appendix records the operational facts reviewed.</p>{dsw ? <section className="can-section"><h2>DSW daily route summary</h2><div className="can-appendix-metrics"><Line label="Route" value={dsw.route_label}/><Line label="Vehicle" value={dsw.vehicle_text}/><Line label="Delivery" value={`${dsw.actual_delivery_stops ?? 0} stops · ${dsw.actual_delivery_packages ?? 0} packages`}/><Line label="Pickups" value={`${dsw.actual_pickup_stops ?? 0} stops · ${dsw.actual_pickup_packages ?? 0} packages`}/><Line label="Exceptions" value={String(dsw.exceptions ?? 0)}/><Line label="Code 85" value={String(dsw.code_85_count ?? 0)}/><Line label="DNA / Send Again" value={`${dsw.dna_count ?? 0} / ${dsw.send_again_count ?? 0}`}/><Line label="Miles / road hours" value={`${dsw.miles ?? "—"} / ${dsw.on_road_hours ?? "—"}`}/></div></section> : null}{codeInstances.length ? <section className="can-section"><h2>All Code package instances</h2><table className="can-appendix-table"><thead><tr><th>Code</th><th>Route / vehicle</th><th>Vision label</th><th>Scan time</th><th>Evidence reference</th></tr></thead><tbody>{codeInstances.map((item: any) => <tr key={item.id}><td>{item.star_status_code || item.vsa_status_code || "—"}</td><td>{dsw?.wa_number || dsw?.route_name || "—"} / {item.vehicle_number || "—"}</td><td>{item.vision_label || "—"}</td><td>{item.star_scan_at_local ? new Date(item.star_scan_at_local).toLocaleString() : "—"}</td><td>{String(item.tracking_ref || "").slice(0,18)}…</td></tr>)}</tbody></table></section> : null}{attendanceEvents.length ? <section className="can-section"><h2>Attendance events since prior attendance CAN</h2><table className="can-appendix-table"><thead><tr><th>Date</th><th>Event</th><th>Manager note</th></tr></thead><tbody>{attendanceEvents.map((event: any) => <tr key={event.id}><td>{event.date}</td><td>{event.event_label}</td><td>{event.note || "—"}</td></tr>)}</tbody></table></section> : null}<p className="can-footer-note">Record ID {action.id} · Evidence captured {evidenceSnapshot.captured_at ? new Date(evidenceSnapshot.captured_at).toLocaleString() : "—"} · CAN content hash {action.content_hash || "pending"}</p></article> : null}
  </main>;
}
