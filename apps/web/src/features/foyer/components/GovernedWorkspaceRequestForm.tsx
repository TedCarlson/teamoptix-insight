"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntakeContract, IntakeQuestion } from "@/features/intake/intake.types";

export default function GovernedWorkspaceRequestForm({ requestCaptchaToken, onSent, defaults = {} }: { requestCaptchaToken?: () => Promise<string>; onSent?: () => void; defaults?: Record<string, string> }) {
  const [contract, setContract] = useState<IntakeContract | null>(null);
  const [loadError, setLoadError] = useState("");
  const [lobIds, setLobIds] = useState<string[]>([]);
  const [capabilityIds, setCapabilityIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/foyer/intake-contract", { cache: "no-store" }).then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error ?? "Unable to load the request form.");
    setContract(result);
  }).catch((reason) => setLoadError(reason instanceof Error ? reason.message : "Unable to load the request form.")); }, []);

  const capabilities = useMemo(() => contract?.capabilities.filter((item) => lobIds.length === 0 || item.lobIds.length === 0 || item.lobIds.some((id) => lobIds.includes(id))) ?? [], [contract, lobIds]);
  const questions = useMemo(() => contract?.questions.filter((question) => question.scope === "shared" || question.lobIds.some((id) => lobIds.includes(id)) || question.capabilityIds.some((id) => capabilityIds.includes(id))) ?? [], [contract, lobIds, capabilityIds]);

  function toggle(id: string, current: string[], set: (ids: string[]) => void) { set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function toggleLob(id: string) {
    const next = lobIds.includes(id) ? lobIds.filter((item) => item !== id) : [...lobIds, id];
    setLobIds(next);
    if (contract) setCapabilityIds((current) => current.filter((capabilityId) => contract.capabilities.some((item) => item.id === capabilityId && (next.length === 0 || item.lobIds.length === 0 || item.lobIds.some((lobId) => next.includes(lobId))))));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("sending"); setError("");
    const form = event.currentTarget;
    const data = new FormData(form); const answers: Record<string, unknown> = {};
    for (const question of questions) answers[question.id] = question.fieldType === "checkbox" ? data.get(question.id) === "on" : String(data.get(question.id) ?? "");
    let captchaToken: string | null = null;
    try {
      captchaToken = requestCaptchaToken ? await requestCaptchaToken() : null;
    } catch {
      setStatus("error"); setError("Security verification could not start. Please try again."); return;
    }
    const response = await fetch("/api/foyer/workspace-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lobIds, capabilityIds, answers, captchaToken }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) { const message=result?.error ?? "Unable to send workspace request."; setStatus("error"); setError(message); return; }
    setStatus("sent");
    onSent?.();
  }

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!contract) return <p>Loading current workspace configuration…</p>;
  return <form className="foyer-request-form" onSubmit={submit}>
    <fieldset className="foyer-request-form__wide intake-selection-group"><legend><span>1</span> What kind of operation do you run?</legend><p>Select all that apply.</p><div className="intake-choice-grid">{contract.linesOfBusiness.map((item) => <label className={lobIds.includes(item.id) ? "intake-choice intake-choice--selected" : "intake-choice"} key={item.id}><input type="checkbox" checked={lobIds.includes(item.id)} onChange={() => toggleLob(item.id)} /><span>{item.label}</span></label>)}</div></fieldset>
    <fieldset className="foyer-request-form__wide intake-selection-group"><legend><span>2</span> Where would you like help first?</legend><p>Choose the Insight capabilities that matter to you now.</p><div className="intake-choice-grid">{capabilities.map((item) => <label className={capabilityIds.includes(item.id) ? "intake-choice intake-choice--selected" : "intake-choice"} key={item.id}><input type="checkbox" checked={capabilityIds.includes(item.id)} onChange={() => toggle(item.id, capabilityIds, setCapabilityIds)} /><span>{item.label}</span></label>)}</div></fieldset>
    <div className="foyer-request-form__wide intake-details-heading"><span>3</span><div><strong>Tell us about your business</strong><p>We&apos;ll use this to prepare a useful first conversation.</p></div></div>
    {questions.map((question) => <QuestionField key={question.id} question={question} defaultValue={defaults[question.key]} />)}
    <div className="foyer-request-overlay__footer">
      <p>We&apos;ll use this to prepare a focused introduction around your operation. No obligation.</p>
      {status === "sent" ? <strong>Workspace request sent. We&apos;ll review it and reach out.</strong> : <button type="submit" className="button button-primary" disabled={status === "sending"}>{status === "sending" ? "Verifying and sending..." : "Send Workspace Request"}</button>}
      {status === "error" ? <p role="alert" style={{ color: "#b91c1c", fontWeight: 800 }}>{error}</p> : null}
    </div>
  </form>;
}

function QuestionField({ question, defaultValue }: { question: IntakeQuestion; defaultValue?: string }) {
  const shared = { name: question.id, required: question.required, defaultValue, placeholder: question.placeholder ?? undefined };
  return <label className={question.fieldType === "textarea" ? "foyer-request-form__wide" : undefined}>{question.label}{question.helperText ? <small>{question.helperText}</small> : null}
    {question.fieldType === "textarea" ? <textarea {...shared} rows={3} /> : question.fieldType === "select" ? <select {...shared}><option value="">Select…</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select> : question.fieldType === "checkbox" ? <input name={question.id} type="checkbox" required={question.required} /> : <input {...shared} type={question.fieldType} />}
  </label>;
}
