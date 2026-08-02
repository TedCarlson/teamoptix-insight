"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import legalStyles from "@/features/legal/components/legal-workspace.module.css";
import type { CompanyPolicySection, CompanyPolicyWorkspace } from "../types";

const inputClass = legalStyles.metadataInput;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function CompanyPolicyStudioPage() {
  const slug = String(useParams()?.slug ?? "");
  const [workspace, setWorkspace] = useState<CompanyPolicyWorkspace | null>(null);
  const [policyId, setPolicyId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionBody, setSectionBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (nextPolicyId?: string) => {
    const target = nextPolicyId ?? policyId;
    const response = await fetch(`/api/company/${slug}/people/policies${target ? `?policyId=${target}` : ""}`, { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load company policies.");
    setWorkspace(data);
    const selectedId = data.selected_policy?.id || "";
    setPolicyId(selectedId);
    setTitle(data.selected_policy?.title || "");
    setDescription(data.selected_policy?.description || "");
    const firstSection = data.sections?.[0];
    setSectionId((current) => data.sections?.some((section: CompanyPolicySection) => section.id === current) ? current : firstSection?.id || "");
  }, [policyId, slug]);

  useEffect(() => { if (slug) load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load company policies.")); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const section = useMemo(() => workspace?.sections.find((item) => item.id === sectionId) ?? workspace?.sections[0] ?? null, [sectionId, workspace]);
  const latestVersion = workspace?.versions[0] ?? null;
  const latestAssignments = useMemo(() => latestVersion ? (workspace?.assignments ?? []).filter((item) => item.version_id === latestVersion.id) : [], [latestVersion, workspace]);

  useEffect(() => { setSectionTitle(section?.title || ""); setSectionBody(section?.body || ""); }, [section]);

  async function call(path: string, payload: Record<string, unknown>) {
    const response = await fetch(`/api/company/${slug}/people/policies${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "The requested policy change could not be completed.");
    return data;
  }

  async function createPolicy() {
    if (!newTitle.trim()) { setError("Enter a policy name."); return; }
    setBusy(true); setError(""); setMessage("");
    try { const data = await call("", { title: newTitle, description: newDescription }); setCreating(false); setNewTitle(""); setNewDescription(""); await load(data.id); setMessage("Policy created. Start with the Purpose section, then add sections as needed."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create the policy."); }
    finally { setBusy(false); }
  }

  async function savePolicyDetails() {
    if (!policyId || !title.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try { await call("", { id: policyId, title, description }); await load(policyId); setMessage("Policy details saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save policy details."); }
    finally { setBusy(false); }
  }

  async function sectionAction(action: "ADD" | "SAVE" | "UP" | "DOWN" | "ARCHIVE", target?: CompanyPolicySection) {
    if (!policyId) return;
    if (action === "ARCHIVE" && !window.confirm(`Remove “${target?.title}” from the working draft? Published versions will not change.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await call("/sections", { policyId, sectionId: target?.id || section?.id || null, action, title: action === "SAVE" ? sectionTitle : action === "ADD" ? "New section" : target?.title, body: action === "SAVE" ? sectionBody : target?.body });
      await load(policyId);
      if (action === "ADD" && data?.id) setSectionId(data.id);
      setMessage(action === "SAVE" ? "Section saved." : "Policy structure updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update this section."); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!policyId || !workspace?.selected_policy) return;
    if (!window.confirm(`Roll out a new version of “${title}” to every active employee? The released version cannot be edited.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await call("", { id: policyId, title, description });
      if (section) await call("/sections", { policyId, sectionId: section.id, action: "SAVE", title: sectionTitle, body: sectionBody });
      await call("/publish", { policyId });
      await load(policyId);
      setMessage("New policy version released. Employee acknowledgment tasks are ready.");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to release this policy."); }
    finally { setBusy(false); }
  }

  async function copyVersionLink(versionId: string) {
    const url = `${window.location.origin}/company/${slug}/people/policies/versions/${versionId}/print`;
    await navigator.clipboard.writeText(url);
    setMessage("Policy link copied.");
  }

  if (!workspace) return <main className="workspace-shell"><section className="workspace-main"><section className="app-card workspace-section"><p>{error || "Loading Policy Studio…"}</p></section></section></main>;

  return <main className="workspace-shell"><section className="workspace-main policy-studio-shell">
    <header className="workspace-header"><div className="workspace-header__copy"><p className="eyebrow">People · Policy Studio</p><h1 className="workspace-title">Company Policies</h1><p className="workspace-subtitle">Build policies by section, release a fixed version to employees, and retain every acknowledgment.</p></div><div className="workspace-header__action"><button className="button button-primary" type="button" onClick={() => setCreating(true)}>Create policy</button></div></header>

    {creating ? <section className="app-card workspace-section policy-create-panel"><div><p className="eyebrow">New company policy</p><h2>Name the policy</h2><p className="muted">A Purpose section is created automatically. Add or remove sections until the policy fits the business.</p></div><label><span>Policy name</span><input className={inputClass} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Attendance and call-out policy"/></label><label><span>Short description</span><textarea className={inputClass} rows={2} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="What employees should understand about this policy"/></label><div className="cta-row"><button className="button button-primary" disabled={busy} onClick={() => void createPolicy()}>Create and start writing</button><button className="button" onClick={() => setCreating(false)}>Cancel</button></div></section> : null}
    {error ? <p className="policy-feedback is-error">{error}</p> : null}{message ? <p className="policy-feedback">{message}</p> : null}

    {!workspace.selected_policy ? <section className="app-card workspace-section policy-empty"><h2>Create the first company policy</h2><p>No policy documents exist yet. Start with a name; the section workbench will open automatically.</p><button className="button button-primary" onClick={() => setCreating(true)}>Create policy</button></section> : <section className={legalStyles.workspace}>
      <header className={legalStyles.toolbar}><div><p className={legalStyles.eyebrow}>Company Policy Workbench</p><h2 className={legalStyles.title}>{workspace.selected_policy.title}</h2><p className={legalStyles.toolbarMeta}>Working draft · {workspace.sections.length} section{workspace.sections.length === 1 ? "" : "s"} · Latest release {workspace.selected_policy.current_version ? `v${workspace.selected_policy.current_version}` : "none"}</p></div><div className={legalStyles.toolbarActions}><select className={inputClass} aria-label="Open another policy" value={policyId} onChange={(event) => void load(event.target.value)}>{workspace.policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.title}</option>)}</select><button className={legalStyles.secondaryButton} type="button" disabled={busy} onClick={() => void savePolicyDetails()}>Save draft</button><button className={legalStyles.primaryButton} type="button" disabled={busy} onClick={() => void publish()}>Release to employees</button></div></header>

      <section className="policy-details-strip"><label><span>Policy name</span><input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)}/></label><label><span>Purpose shown to employees</span><input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short explanation of this policy"/></label></section>

      <div className={legalStyles.body}>
        <nav className={legalStyles.rail} aria-label="Policy sections"><div className={legalStyles.railHeader}><div className={legalStyles.railHeaderRow}><p className={legalStyles.panelLabel}>Policy sections</p><button className={legalStyles.miniButton} type="button" disabled={busy} onClick={() => void sectionAction("ADD")}>Add</button></div></div><div className={legalStyles.railScroll}><div className={legalStyles.sectionList}>{workspace.sections.map((item, index) => <div key={item.id} className={legalStyles.sectionRailItem}><button className={item.id === section?.id ? legalStyles.sectionButtonActive : legalStyles.sectionButton} type="button" onClick={() => setSectionId(item.id)}><span className={legalStyles.sectionNumber}>{index + 1}</span><span>{item.title}</span></button><div className={legalStyles.sectionRailActions}><button className={legalStyles.iconButton} disabled={busy || index === 0} onClick={() => void sectionAction("UP", item)} aria-label="Move section up">↑</button><button className={legalStyles.iconButton} disabled={busy || index === workspace.sections.length - 1} onClick={() => void sectionAction("DOWN", item)} aria-label="Move section down">↓</button><button className={legalStyles.iconButtonDanger} disabled={busy || workspace.sections.length === 1} onClick={() => void sectionAction("ARCHIVE", item)} aria-label="Remove section">×</button></div></div>)}</div></div><div className={legalStyles.railFooter}>{workspace.sections.length} section{workspace.sections.length === 1 ? "" : "s"}</div></nav>

        <section className={legalStyles.editor}>{section ? <article className={legalStyles.documentCard}><header className={legalStyles.documentHeader}><div className={legalStyles.documentHeaderContent}><p className={legalStyles.panelLabel}>Section {section.position}</p><label className={legalStyles.titleFieldLabel}><span>Section title</span><input className={legalStyles.titleInput} value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)}/></label></div><div className={legalStyles.editorActions}><button className={legalStyles.primaryButton} disabled={busy} onClick={() => void sectionAction("SAVE", section)}>Save section</button></div></header><textarea className={legalStyles.editorTextarea} value={sectionBody} onChange={(event) => setSectionBody(event.target.value)} placeholder="Write the policy in plain language employees can understand."/></article> : null}</section>

        <aside className={legalStyles.inspector}><section className={legalStyles.inspectorSection}><p className={legalStyles.panelLabel}>Release readiness</p><div className="policy-readiness"><strong>{workspace.sections.every((item) => item.body.trim()) ? "Ready to release" : "Finish incomplete sections"}</strong><p>Release creates an uneditable version and sends it to every active employee for acknowledgment.</p></div><button className={legalStyles.primaryButton} disabled={busy || !workspace.sections.every((item) => item.body.trim())} onClick={() => void publish()}>Release new version</button></section><section className={legalStyles.inspectorSection}><div className={legalStyles.inspectorHeadingRow}><p className={legalStyles.panelLabel}>Latest release</p><span className={legalStyles.sectionBadge}>{latestVersion ? `v${latestVersion.version_number}` : "None"}</span></div>{latestVersion ? <div className="policy-release-summary"><strong>{latestVersion.acknowledged_count} of {latestVersion.assigned_count} acknowledged</strong><span>{latestVersion.declined_count} declined · {latestVersion.assigned_count - latestVersion.acknowledged_count - latestVersion.declined_count} awaiting response</span><a className={legalStyles.secondaryButton} href={`/company/${slug}/people/policies/versions/${latestVersion.id}/print`} target="_blank">View / print</a></div> : <p className={legalStyles.emptyHelper}>This policy has not been released.</p>}</section><section className={legalStyles.inspectorSection}><a className={legalStyles.secondaryButton} href={`/company/${slug}/people/policies/my`}>Open employee view</a></section></aside>
      </div>

      <section className="app-card workspace-section"><div className="workspace-section__head"><div><p className="eyebrow">Version history</p><h2>Released policy record</h2><p className="workspace-subtitle">Every released version remains available with its rollout and acknowledgment history.</p></div></div>{workspace.versions.length ? <div className="policy-version-list">{workspace.versions.map((version) => <article key={version.id}><div><strong>Version {version.version_number}</strong><span>{formatDate(version.published_at)} · {version.section_count} sections · released by {version.published_by}</span></div><div><span>{version.acknowledged_count}/{version.assigned_count} acknowledged</span><a className="button" href={`/company/${slug}/people/policies/versions/${version.id}/print`} target="_blank">View / print</a><button className="button" onClick={() => void copyVersionLink(version.id)}>Copy link</button></div></article>)}</div> : <p className="muted">No released versions yet.</p>}</section>

      {latestVersion ? <section className="app-card workspace-section"><div className="workspace-section__head"><div><p className="eyebrow">Employee acknowledgment</p><h2>Version {latestVersion.version_number} rollout</h2><p className="workspace-subtitle">Reviewed and response dates are preserved with each employee record.</p></div></div><div className="policy-ack-table"><div className="policy-ack-row is-head"><span>Employee</span><span>Status</span><span>Reviewed</span><span>Responded</span></div>{latestAssignments.map((assignment) => <div className="policy-ack-row" key={assignment.id}><strong>{assignment.employee_name}</strong><span>{assignment.status.toLowerCase()}</span><span>{formatDate(assignment.reviewed_at)}</span><span>{formatDate(assignment.responded_at)}</span></div>)}</div></section> : null}
    </section>}
  </section></main>;
}
