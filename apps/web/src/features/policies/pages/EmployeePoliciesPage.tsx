"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { EmployeePolicyTask } from "../types";

type Workspace = { company: { name: string }; roster_id: string | null; tasks: EmployeePolicyTask[] };

function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—"; }

export default function EmployeePoliciesPage() {
  const slug = String(useParams()?.slug ?? "");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/company/${slug}/people/policies/my`, { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load your company policies.");
    setWorkspace(data);
    setSelectedId((current) => current || data.tasks?.find((task: EmployeePolicyTask) => task.status === "PENDING")?.id || data.tasks?.[0]?.id || "");
  }

  useEffect(() => { if (slug) load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load your company policies.")); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const task = useMemo(() => workspace?.tasks.find((item) => item.id === selectedId) ?? null, [selectedId, workspace]);

  async function respond(responseValue: "ACKNOWLEDGED" | "DECLINED") {
    if (!task || (responseValue === "ACKNOWLEDGED" && !confirmed)) { setError("Confirm that you reviewed the full policy before acknowledging it."); return; }
    if (responseValue === "DECLINED" && !comment.trim()) { setError("Please explain why you are declining to acknowledge the policy."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/company/${slug}/people/policies/my`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentId: task.id, response: responseValue, comment }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Your response could not be recorded.");
      setConfirmed(false); setComment(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your response could not be recorded."); }
    finally { setBusy(false); }
  }

  if (!workspace) return <main className="workspace-shell"><section className="workspace-main"><section className="app-card workspace-section"><p>{error || "Loading your policies…"}</p></section></section></main>;
  if (!workspace.roster_id) return <main className="workspace-shell"><section className="workspace-main"><section className="app-card workspace-section"><h1>Company Policies</h1><p>Your login is not connected to an employee roster record. Ask a company administrator to connect it before you acknowledge a policy.</p></section></section></main>;

  return <main className="workspace-shell"><section className="workspace-main employee-policy-shell">
    <header className="workspace-header"><div className="workspace-header__copy"><p className="eyebrow">{workspace.company.name}</p><h1 className="workspace-title">My Company Policies</h1><p className="workspace-subtitle">Open each policy, read every section, and record your response.</p></div></header>
    {error ? <p className="policy-feedback is-error">{error}</p> : null}
    {!workspace.tasks.length ? <section className="app-card workspace-section"><h2>You are up to date</h2><p>No policies are waiting for your review.</p></section> : <div className="employee-policy-layout"><aside className="app-card employee-policy-list"><p className="eyebrow">Policies</p>{workspace.tasks.map((item) => <button key={item.id} className={item.id === selectedId ? "employee-policy-option is-selected" : "employee-policy-option"} onClick={() => { setSelectedId(item.id); setConfirmed(false); setComment(""); }}><span>{item.version.title}</span><small>Version {item.version.number} · {item.status === "PENDING" ? "Response needed" : item.status.toLowerCase()}</small></button>)}</aside>{task ? <article className="app-card employee-policy-document"><header><p className="eyebrow">Version {task.version.number} · Released {formatDate(task.version.published_at)}</p><h2>{task.version.title}</h2><p>{task.version.description}</p></header><div className="employee-policy-content">{task.version.snapshot.sections.map((section) => <section key={`${section.position}-${section.title}`}><span>{section.position}</span><div><h3>{section.title}</h3>{section.body.split(/\n{2,}/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}</div><footer>{task.status === "PENDING" ? <><label className="employee-policy-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>I received, reviewed, and understand this company policy.</span></label><label className="employee-policy-comment"><span>Comment (optional when acknowledging)</span><textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a question or response for company leadership"/></label><div className="cta-row"><button className="button button-primary" disabled={busy || !confirmed} onClick={() => void respond("ACKNOWLEDGED")}>Acknowledge policy</button><button className="button" disabled={busy} onClick={() => void respond("DECLINED")}>Decline and send comment</button></div></> : <div className="employee-policy-record"><strong>Response recorded: {task.status.toLowerCase()}</strong><span>{formatDate(task.responded_at)}</span>{task.response_comment ? <p>{task.response_comment}</p> : null}<a className="button" href={`/company/${slug}/people/policies/versions/${task.version.id}/print`} target="_blank">View / print this version</a></div>}</footer></article> : null}</div>}
  </section></main>;
}

