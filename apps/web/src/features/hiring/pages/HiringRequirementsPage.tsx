"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Plus, Sparkles } from "lucide-react";
import styles from "../hiring-workspace.module.css";

type Requirement = {
  id: string;
  item_key: string;
  display_label: string;
  candidate_description?: string | null;
  description?: string | null;
  category: string;
  phase: string;
  evidence_type?: string | null;
  role_key?: string | null;
  location_key?: string | null;
  assignment_key?: string | null;
  is_required: boolean;
  is_blocking: boolean;
  is_enabled: boolean;
  expose_in_foyer: boolean;
  readiness_weight: number | string;
  sort_order: number;
  source_scope: "generic" | "industry" | "company";
};

type Draft = {
  itemKey: string;
  label: string;
  description: string;
  category: string;
  phase: string;
  evidenceType: string;
  roleKey: string;
  locationKey: string;
  assignmentKey: string;
  isRequired: boolean;
  isBlocking: boolean;
  isEnabled: boolean;
  exposeInFoyer: boolean;
  readinessWeight: number;
  sortOrder: number;
  sourceScope: "generic" | "industry" | "company";
};

type TargetOption = { value: string; label: string };
type TargetOptions = { roles: TargetOption[]; locations: TargetOption[]; assignments: TargetOption[] };
type BioDraft = {
  headline: string;
  summary: string;
  terminalName: string;
  terminalAddress: string;
  primaryWorkArea: string;
  workDescription: string;
  candidateNote: string;
  isPublished: boolean;
};

const emptyBio: BioDraft = {
  headline: "",
  summary: "",
  terminalName: "",
  terminalAddress: "",
  primaryWorkArea: "",
  workDescription: "",
  candidateNote: "",
  isPublished: false,
};

const emptyDraft: Draft = {
  itemKey: "",
  label: "",
  description: "",
  category: "Readiness",
  phase: "finalist",
  evidenceType: "",
  roleKey: "",
  locationKey: "",
  assignmentKey: "",
  isRequired: true,
  isBlocking: true,
  isEnabled: true,
  exposeInFoyer: true,
  readinessWeight: 1,
  sortOrder: 100,
  sourceScope: "company",
};

function toDraft(item: Requirement): Draft {
  const evidenceAliases: Record<string, string> = {
    profile: "Profile information",
    document_or_profile: "Document",
    document: "Document",
    authorization: "Authorization",
    clearance: "Clearance confirmation",
    form: "Acknowledgment",
  };
  return {
    itemKey: item.item_key,
    label: item.display_label,
    description: item.candidate_description ?? item.description ?? "",
    category: item.category || "Readiness",
    phase: item.phase || "finalist",
    evidenceType: item.evidence_type ? evidenceAliases[item.evidence_type] ?? item.evidence_type : "",
    roleKey: item.role_key ?? "",
    locationKey: item.location_key ?? "",
    assignmentKey: item.assignment_key ?? "",
    isRequired: item.is_required,
    isBlocking: item.is_blocking,
    isEnabled: item.is_enabled,
    exposeInFoyer: item.expose_in_foyer,
    readinessWeight: Number(item.readiness_weight ?? 1),
    sortOrder: item.sort_order ?? 100,
    sourceScope: item.source_scope,
  };
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    application: "With the application",
    interview: "Before the interview",
    finalist: "Before a hiring decision",
    pre_assignment: "Before assignment access",
    onboarding: "During onboarding",
  };
  return labels[phase] ?? phase.replaceAll("_", " ");
}

export default function HiringRequirementsPage() {
  const slug = String(useParams()?.slug ?? "");
  const [items, setItems] = useState<Requirement[]>([]);
  const [industryLabel, setIndustryLabel] = useState<string | null>(null);
  const [targetOptions, setTargetOptions] = useState<TargetOptions>({ roles: [], locations: [], assignments: [] });
  const [bio, setBio] = useState<BioDraft>(emptyBio);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "company">("all");

  const load = useCallback(async () => {
    const response = await fetch(`/api/company/${slug}/people/requirements`, {
      cache: "no-store",
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load readiness requirements.");
    const nextItems = (body.requirements || []) as Requirement[];
    setItems(nextItems);
    setIndustryLabel(body.industry?.label ?? null);
    setTargetOptions(body.options ?? { roles: [], locations: [], assignments: [] });
    setBio({
      headline: body.bio?.headline ?? "",
      summary: body.bio?.summary ?? "",
      terminalName: body.bio?.terminal_name ?? "",
      terminalAddress: body.bio?.terminal_address ?? "",
      primaryWorkArea: body.bio?.primary_work_area ?? "",
      workDescription: body.bio?.work_description ?? "",
      candidateNote: body.bio?.candidate_note ?? "",
      isPublished: Boolean(body.bio?.is_published),
    });
    return nextItems;
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    void load().catch((reason) => setError(reason.message));
  }, [load, slug]);

  const selected = useMemo(
    () => items.find((item) => item.item_key === selectedKey) ?? null,
    [items, selectedKey],
  );

  const visibleItems = useMemo(() => {
    if (filter === "published") return items.filter((item) => item.is_enabled);
    if (filter === "company") return items.filter((item) => item.source_scope === "company");
    return items;
  }, [filter, items]);

  function selectItem(item: Requirement) {
    setSelectedKey(item.item_key);
    setDraft(toDraft(item));
    setMessage("");
    setError("");
  }

  function startNew() {
    setSelectedKey(null);
    setDraft(emptyDraft);
    setMessage("");
    setError("");
  }

  async function request(payload: Record<string, unknown>) {
    const response = await fetch(`/api/company/${slug}/people/requirements`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to save readiness requirements.");
    return body;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(draft);
      const nextItems = await load();
      const saved = nextItems.find((item) => item.item_key === draft.itemKey);
      if (saved) selectItem(saved);
      setMessage("Readiness requirement saved. The pipeline and Foyer now use this version.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this requirement.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBaseline() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request({ action: "apply_industry_baseline" });
      await load();
      setMessage(
        result.added
          ? `${result.added} baseline requirements added. Review and publish from this workbench.`
          : "Your industry baseline is already in place.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply the baseline.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request({ action: "save_company_bio", ...bio });
      await load();
      setMessage("Company Bio saved. Published details now appear in the candidate Foyer.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the Company Bio.");
    } finally {
      setBusy(false);
    }
  }

  async function addTsaPreset() {
    const tsa: Draft = {
      ...emptyDraft,
      itemKey: "tsa_background_express_terminal",
      label: "TSA background clearance",
      description:
        "Required for terminal access where Express validates air-worthy cargo. This access requirement does not change contractor classification.",
      category: "Terminal access",
      phase: "pre_assignment",
      evidenceType: "Clearance confirmation",
      assignmentKey: "fedex_express_terminal_access",
      readinessWeight: 2,
      sortOrder: 80,
    };
    setDraft(tsa);
    setSelectedKey(null);
  }

  const publishedCount = items.filter((item) => item.is_enabled).length;
  const foyerCount = items.filter((item) => item.is_enabled && item.expose_in_foyer).length;

  return (
    <main className="workspace-shell">
      <section className={`workspace-main ${styles.stack}`}>
        <header className={`workspace-header ${styles.pageHeader}`}>
          <div className="workspace-header__copy">
            <p className={styles.eyebrow}>People · Hiring</p>
            <h1 className="workspace-title">Readiness Workbench</h1>
            <p className="workspace-subtitle">
              Establish what ready means once. Insight carries it into candidate journeys,
              onboarding, the Foyer, and reporting.
            </p>
          </div>
          <div className={styles.summaryStrip} aria-label="Readiness summary">
            <div className={styles.summaryItem}><span>Industry</span><strong>{industryLabel || "General"}</strong></div>
            <div className={styles.summaryItem}><span>In readiness</span><strong>{publishedCount}</strong></div>
            <div className={styles.summaryItem}><span>Shared early</span><strong>{foyerCount}</strong></div>
          </div>
        </header>

        {error ? <p className={styles.feedbackError}>{error}</p> : null}
        {message ? <p className={styles.feedback}>{message}</p> : null}

        <section className={styles.surface}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.eyebrow}>Start with the standard</p>
              <h2>{industryLabel ? `${industryLabel} readiness baseline` : "Candidate readiness baseline"}</h2>
              <p>Bring in the shared industry expectations, then add only what is unique to this company.</p>
            </div>
            <button className="button" type="button" disabled={busy} onClick={() => void applyBaseline()}>
              <Sparkles size={16} aria-hidden /> Use baseline
            </button>
          </div>
        </section>

        <section className={styles.surface}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.eyebrow}>Candidate-facing company bio</p>
              <h2>Show candidates where the work happens</h2>
              <p>Give applicants practical context about the terminal hub, primary work area, and day-to-day operation before they apply.</p>
            </div>
            <span className={bio.isPublished ? styles.badgeGreen : styles.badge}>{bio.isPublished ? "Published" : "Draft"}</span>
          </div>
          <div className={styles.surfaceBody}>
            <form className={styles.formStack} onSubmit={saveBio}>
              <div className={styles.formGridTwo}>
                <label className={styles.field}><span className={styles.fieldLabel}>Bio headline</span><input className={styles.control} value={bio.headline} placeholder="Local delivery work with a team that knows the territory" onChange={(event) => setBio({ ...bio, headline: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Terminal hub</span><input className={styles.control} value={bio.terminalName} placeholder="Pulled from Operations when available" onChange={(event) => setBio({ ...bio, terminalName: event.target.value })} /></label>
              </div>
              <label className={styles.field}><span className={styles.fieldLabel}>Short company introduction</span><textarea className={styles.textarea} value={bio.summary} placeholder="What should a candidate know about this company and its team?" onChange={(event) => setBio({ ...bio, summary: event.target.value })} /></label>
              <div className={styles.formGridTwo}>
                <label className={styles.field}><span className={styles.fieldLabel}>Terminal address</span><input className={styles.control} value={bio.terminalAddress} placeholder="Pulled from the active terminal when available" onChange={(event) => setBio({ ...bio, terminalAddress: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Primary work area</span><input className={styles.control} value={bio.primaryWorkArea} placeholder="Cities, counties, or service territory" onChange={(event) => setBio({ ...bio, primaryWorkArea: event.target.value })} /></label>
              </div>
              <div className={styles.formGridTwo}>
                <label className={styles.field}><span className={styles.fieldLabel}>What the work is like</span><textarea className={styles.textarea} value={bio.workDescription} placeholder="Typical routes, schedule, physical expectations, and team rhythm" onChange={(event) => setBio({ ...bio, workDescription: event.target.value })} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Good to know before applying</span><textarea className={styles.textarea} value={bio.candidateNote} placeholder="Parking, arrival, seasonal needs, or other useful context" onChange={(event) => setBio({ ...bio, candidateNote: event.target.value })} /></label>
              </div>
              <label className={styles.checkbox}><input type="checkbox" checked={bio.isPublished} onChange={(event) => setBio({ ...bio, isPublished: event.target.checked })} /><span>Publish this Company Bio in the Foyer and company chooser</span></label>
              <div className={styles.formActions}><button className={`button button-primary ${styles.primaryAction}`} disabled={busy} type="submit">{busy ? "Saving…" : "Save Company Bio"}</button></div>
            </form>
          </div>
        </section>

        <section className={styles.surface}>
          <div className={styles.workbench}>
            <aside className={styles.workbenchRail}>
              <div className={styles.railHeader}>
                <p className={styles.eyebrow}>Readiness contract</p>
                <h2>{items.length} requirements</h2>
                <div className={styles.railFilters}>
                  {(["all", "published", "company"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={filter === value ? styles.filterButtonActive : styles.filterButton}
                      onClick={() => setFilter(value)}
                    >
                      {value === "all" ? "All" : value === "published" ? "Published" : "Add-ons"}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.railList}>
                {visibleItems.map((item) => (
                  <button
                    key={item.item_key}
                    type="button"
                    className={selectedKey === item.item_key ? styles.railItemActive : styles.railItem}
                    onClick={() => selectItem(item)}
                  >
                    <strong>{item.display_label}</strong>
                    <span>{item.source_scope} · {item.is_enabled ? "published" : "paused"}</span>
                  </button>
                ))}
                {!visibleItems.length ? (
                  <div className={styles.emptyState}>
                    <strong>No requirements here yet</strong>
                    <p>Use the baseline or add the first company requirement.</p>
                  </div>
                ) : null}
              </div>

              <div className={styles.railFooter}>
                <button className="button button-primary" type="button" onClick={startNew}>
                  <Plus size={16} aria-hidden /> Add company requirement
                </button>
                <button className="button" type="button" onClick={() => void addTsaPreset()}>
                  Add TSA terminal preset
                </button>
              </div>
            </aside>

            <div className={styles.editor}>
              <div className={styles.editorHeader}>
                <div>
                  <p className={styles.eyebrow}>{selected ? "Edit requirement" : "Company add-on"}</p>
                  <h2>{selected ? selected.display_label : "Add one clear expectation"}</h2>
                  <p>Write it once in plain language. Candidate and team surfaces stay aligned.</p>
                </div>
                {draft.isEnabled ? <span className={styles.badgeGreen}><Check size={12} /> Published</span> : <span className={styles.badge}>Paused</span>}
              </div>

              <form className={styles.formStack} onSubmit={save}>
                <section className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>What should the candidate expect?</h3>
                  <div className={styles.formGridTwo}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Requirement name</span>
                      <input
                        className={styles.control}
                        value={draft.label}
                        required
                        onChange={(event) => {
                          const label = event.target.value;
                          setDraft((current) => ({
                            ...current,
                            label,
                            itemKey: selectedKey
                              ? current.itemKey
                              : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
                          }));
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Needed by</span>
                      <select className={styles.control} value={draft.phase} onChange={(event) => setDraft({ ...draft, phase: event.target.value })}>
                        <option value="application">With the application</option>
                        <option value="interview">Before the interview</option>
                        <option value="finalist">Before a hiring decision</option>
                        <option value="pre_assignment">Before assignment access</option>
                        <option value="onboarding">During onboarding</option>
                      </select>
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Candidate-facing explanation</span>
                    <textarea className={styles.textarea} value={draft.description} required onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                    <span className={styles.fieldHint}>This appears in the Foyer FYI card and the candidate journey.</span>
                  </label>
                  <div className={styles.formGridTwo}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Type</span>
                      <select className={styles.control} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                        {["Readiness", "Application", "Identity", "Screening", "Qualification", "Safety", "Terminal access", "Onboarding"].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>What confirms it?</span>
                      <select className={styles.control} value={draft.evidenceType} onChange={(event) => setDraft({ ...draft, evidenceType: event.target.value })}>
                        <option value="">No evidence collected</option>
                        {["Profile information", "Document", "Authorization", "Screening result", "Clearance confirmation", "Training completion", "Acknowledgment"].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  </div>
                </section>

                <section className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>How Insight should use it</h3>
                  <div className={styles.formGridTwo}>
                    <label className={styles.checkbox}><input type="checkbox" checked={draft.isEnabled} onChange={(event) => setDraft({ ...draft, isEnabled: event.target.checked })} /><span>Count this in candidate readiness</span></label>
                    <label className={styles.checkbox}><input type="checkbox" checked={draft.exposeInFoyer} onChange={(event) => setDraft({ ...draft, exposeInFoyer: event.target.checked })} /><span>Share this expectation early in the Foyer</span></label>
                    <label className={styles.checkbox}><input type="checkbox" checked={draft.isRequired} onChange={(event) => setDraft({ ...draft, isRequired: event.target.checked })} /><span>Required for readiness</span></label>
                    <label className={styles.checkbox}><input type="checkbox" checked={draft.isBlocking} onChange={(event) => setDraft({ ...draft, isBlocking: event.target.checked })} /><span>Block advancement until complete</span></label>
                  </div>
                </section>

                <details>
                  <summary className={styles.formSectionTitle}>Optional targeting</summary>
                  <div className={styles.formGrid} style={{ marginTop: 12 }}>
                    <label className={styles.field}><span className={styles.fieldLabel}>Role</span><select className={styles.control} value={draft.roleKey} onChange={(event) => setDraft({ ...draft, roleKey: event.target.value })}><option value="">Any role</option>{targetOptions.roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Location</span><select className={styles.control} value={draft.locationKey} onChange={(event) => setDraft({ ...draft, locationKey: event.target.value })}><option value="">Any location</option>{draft.locationKey && !targetOptions.locations.some((option) => option.value === draft.locationKey) ? <option value={draft.locationKey}>{draft.locationKey}</option> : null}{targetOptions.locations.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Assignment</span><select className={styles.control} value={draft.assignmentKey} onChange={(event) => setDraft({ ...draft, assignmentKey: event.target.value })}><option value="">Any assignment</option>{draft.assignmentKey && !targetOptions.assignments.some((option) => option.value === draft.assignmentKey) ? <option value={draft.assignmentKey}>{draft.assignmentKey.replaceAll("_", " ")}</option> : null}{targetOptions.assignments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  </div>
                </details>

                <div className={styles.previewCard}>
                  <span className={styles.expectationMeta}>{draft.category} · {phaseLabel(draft.phase)}</span>
                  <h3>{draft.label || "Requirement preview"}</h3>
                  <p>{draft.description || "The candidate-facing explanation will appear here."}</p>
                </div>

                <div className={styles.formActions}>
                  <button className={`button button-primary ${styles.primaryAction}`} disabled={busy || !draft.itemKey} type="submit">
                    {busy ? "Saving…" : "Save and publish"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
