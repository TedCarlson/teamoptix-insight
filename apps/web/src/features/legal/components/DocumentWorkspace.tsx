"use client";

import { useMemo, useState } from "react";

import { EditorialNotesPanel } from "./EditorialNotesPanel";
import { LegalEditorPane } from "./LegalEditorPane";
import { LegalSectionRail } from "./LegalSectionRail";
import { LegalToolbar } from "./LegalToolbar";
import { LegalAcceptanceOverlay } from "./LegalAcceptanceOverlay";
import { RevisionHistoryPanel } from "./RevisionHistoryPanel";
import styles from "./legal-workspace.module.css";

function documentValue(document: unknown, key: "id" | "title" | "status" | "version") {
  if (!document || typeof document !== "object") return null;
  const value = (document as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

type LegalSection = {
  id: string;
  document_id?: string | null;
  section_number?: string | number | null;
  title?: string | null;
  body_markdown?: string | null;
};

type LegalDocumentVersion = {
  id: string;
  document_id?: string | null;
  version_label?: string | null;
  title?: string | null;
  status?: string | null;
  section_count?: number | null;
  content_snapshot?: {
    document?: { title?: string | null; version_label?: string | null };
    sections?: Array<{
      section_number?: number | null;
      title?: string | null;
      body_markdown?: string | null;
    }>;
  } | null;
  created_at?: string | null;
};

type LegalDocumentAcceptance = {
  id: string;
  document_version_id?: string | null;
  accepted_by_name?: string | null;
  accepted_by_email?: string | null;
  accepted_by_title?: string | null;
  accepted_by_company?: string | null;
  accepted_at?: string | null;
};

type DocumentWorkspaceProps = {
  document?: unknown;
  sections?: LegalSection[] | null;
  versions?: LegalDocumentVersion[] | null;
  acceptances?: LegalDocumentAcceptance[] | null;
  exitHref?: string;
};

function formatVersionDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DocumentWorkspace({
  document = null,
  sections,
  versions,
  acceptances,
  exitHref = "/teamoptix/business/contracts",
}: DocumentWorkspaceProps) {
  const [sectionRows, setSectionRows] = useState<LegalSection[]>(() => {
    return Array.isArray(sections) ? sections : [];
  });
  const [versionRows, setVersionRows] = useState<LegalDocumentVersion[]>(() => {
    return Array.isArray(versions) ? versions : [];
  });
  const [acceptanceRows, setAcceptanceRows] = useState<LegalDocumentAcceptance[]>(() => {
    return Array.isArray(acceptances) ? acceptances : [];
  });
  const [selectedAcceptanceVersion, setSelectedAcceptanceVersion] = useState<LegalDocumentVersion | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState(() => {
    return Array.isArray(sections) ? sections[0]?.id ?? "" : "";
  });
  const [draftMode, setDraftMode] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sectionActionState, setSectionActionState] = useState<"idle" | "saving" | "error">("idle");
  const [versionActionState, setVersionActionState] = useState<"idle" | "locking" | "locked" | "exists" | "error">("idle");

  const safeSections = useMemo(() => sectionRows, [sectionRows]);

  const selectedSection = useMemo(() => {
    return (
      safeSections.find((section) => section.id === selectedSectionId) ??
      safeSections[0] ??
      null
    );
  }, [safeSections, selectedSectionId]);

  const documentTitle = documentValue(document, "title") ?? "Document";
  const documentId = documentValue(document, "id");

  function acceptedRecordForVersion(versionId: string) {
    return acceptanceRows.find((acceptance) => acceptance.document_version_id === versionId) ?? null;
  }

  function updateSection(section: LegalSection) {
    setSectionRows((current) =>
      current.map((row) => (row.id === section.id ? { ...row, ...section } : row))
    );
  }

  function replaceSections(nextSections: LegalSection[]) {
    setSectionRows(nextSections);
    setSelectedSectionId((current) => {
      if (nextSections.some((section) => section.id === current)) return current;
      return nextSections[0]?.id ?? "";
    });
  }

  async function runSectionAction(payload: Record<string, unknown>) {
    try {
      setSectionActionState("saving");
      const res = await fetch("/api/legal/section/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json?.ok) {
        setSectionActionState("error");
        return null;
      }

      setSectionActionState("idle");
      return json;
    } catch {
      setSectionActionState("error");
      return null;
    }
  }

  async function addSection() {
    if (!documentId) return;
    const json = await runSectionAction({
      action: "add",
      documentId,
      title: "New Section",
    });

    if (json?.section) {
      setSectionRows((current) => [...current, json.section]);
      setSelectedSectionId(json.section.id);
    }
  }

  async function moveSection(sectionId: string, direction: "up" | "down") {
    const json = await runSectionAction({
      action: "move",
      sectionId,
      direction,
    });

    if (Array.isArray(json?.sections)) {
      replaceSections(json.sections);
    }
  }

  async function archiveSection(sectionId: string) {
    const confirmed = window.confirm("Archive this section? It will be removed from the active draft.");
    if (!confirmed) return;

    const json = await runSectionAction({
      action: "archive",
      sectionId,
    });

    if (Array.isArray(json?.sections)) {
      replaceSections(json.sections);
    }
  }

  async function lockVersion() {
    if (!documentId) return;

    const confirmed = window.confirm(
      "Lock the current draft as an immutable version snapshot? You can keep editing the draft afterward."
    );
    if (!confirmed) return;

    try {
      setVersionActionState("locking");
      const res = await fetch("/api/legal/document/version/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();

      if (!json?.ok) {
        setVersionActionState("error");
        return;
      }

      if (json.version) {
        setVersionRows((current) => {
          if (current.some((version) => version.id === json.version.id)) return current;
          return [json.version, ...current];
        });
      }

      setVersionActionState(json.alreadyLocked ? "exists" : "locked");
      setTimeout(() => setVersionActionState("idle"), 1800);
    } catch {
      setVersionActionState("error");
    }
  }

  function recordAcceptance(acceptance: LegalDocumentAcceptance) {
    setAcceptanceRows((current) => {
      if (current.some((row) => row.id === acceptance.id)) return current;
      return [acceptance, ...current];
    });
  }

  if (!selectedSection) {
    return (
      <section className={styles.workspace}>
        <LegalToolbar
          document={document}
          draftMode={draftMode}
          exitHref={exitHref}
          versionActionState={versionActionState}
          onToggleDraft={() => setDraftMode((current) => !current)}
          onOpenReview={() => setReviewOpen(true)}
          onLockVersion={lockVersion}
        />
        <div className={styles.emptyState}>
          <p>No sections loaded.</p>
          {draftMode && documentId ? (
            <button className={styles.primaryButton} type="button" onClick={addSection}>
              Add First Section
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace}>
      <LegalToolbar
        document={document}
        draftMode={draftMode}
        exitHref={exitHref}
        versionActionState={versionActionState}
        onToggleDraft={() => setDraftMode((current) => !current)}
        onOpenReview={() => setReviewOpen(true)}
        onLockVersion={lockVersion}
      />

      {draftMode ? (
        <p className={sectionActionState === "error" ? styles.saveError : styles.saveStatus}>
          Section structure: {sectionActionState}
        </p>
      ) : null}

      <div className={styles.body}>
        <LegalSectionRail
          draftMode={draftMode}
          selectedSectionId={selectedSection.id}
          onSelectSection={setSelectedSectionId}
          onAddSection={addSection}
          onMoveSection={moveSection}
          onArchiveSection={archiveSection}
          sections={safeSections}
        />

        <LegalEditorPane
          key={selectedSection.id}
          draftMode={draftMode}
          section={selectedSection}
          onSectionSaved={updateSection}
        />

        <aside className={styles.inspector}>
          <section className={styles.inspectorSection}>
            <div className={styles.inspectorHeadingRow}>
              <p className={styles.panelLabel}>Locked Versions</p>
              <span className={styles.sectionBadge}>{versionRows.length}</span>
            </div>

            <div className={styles.cardStack}>
              {versionRows.length ? (
                versionRows.map((version) => (
                  <article key={version.id} className={styles.versionCard}>
                    <div>
                      <p className={styles.revisionTitle}>Version {version.version_label ?? "—"}</p>
                      <p className={styles.revisionDetail}>
                        {version.status ?? "LOCKED"} · {version.section_count ?? 0} sections
                      </p>
                      {acceptedRecordForVersion(version.id) ? (
                        <p className={styles.revisionDetail}>
                          Accepted {formatVersionDate(acceptedRecordForVersion(version.id)?.accepted_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className={styles.versionCardActions}>
                      <span className={styles.revisionTime}>{formatVersionDate(version.created_at)}</span>
                      <button
                        className={styles.miniButton}
                        type="button"
                        onClick={() => setSelectedAcceptanceVersion(version)}
                      >
                        {acceptedRecordForVersion(version.id) ? "View Acceptance" : "Accept"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.emptyHelper}>No locked versions yet.</p>
              )}
            </div>
          </section>
          <EditorialNotesPanel sectionId={selectedSection.id} />
          <RevisionHistoryPanel sectionId={selectedSection.id} />
        </aside>
      </div>

      {selectedAcceptanceVersion ? (
        <LegalAcceptanceOverlay
          version={selectedAcceptanceVersion}
          existingAcceptance={acceptedRecordForVersion(selectedAcceptanceVersion.id)}
          onClose={() => setSelectedAcceptanceVersion(null)}
          onAccepted={(acceptance) => {
            recordAcceptance(acceptance);
            setSelectedAcceptanceVersion(null);
          }}
        />
      ) : null}

      {reviewOpen ? (
        <div className={styles.reviewBackdrop} role="presentation">
          <section className={styles.reviewPanel} role="dialog" aria-modal="true" aria-label="Document review">
            <header className={styles.reviewHeader}>
              <div>
                <p className={styles.eyebrow}>Review Document</p>
                <h2 className={styles.title}>{documentTitle}</h2>
                <p className={styles.toolbarMeta}>Full assembled document preview</p>
              </div>

              <div className={styles.toolbarActions}>
                <button className={styles.secondaryButton} type="button" disabled>
                  Word
                </button>
                <button className={styles.secondaryButton} type="button" disabled>
                  PDF
                </button>
                <button className={styles.primaryButton} type="button" onClick={() => setReviewOpen(false)}>
                  Close
                </button>
              </div>
            </header>

            <article className={styles.reviewDocument}>
              {safeSections.map((section) => (
                <section key={section.id} className={styles.reviewSection}>
                  <p className={styles.panelLabel}>Section {section.section_number ?? "—"}</p>
                  <h3>{section.title ?? "Untitled Section"}</h3>
                  {(section.body_markdown ?? "")
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                </section>
              ))}
            </article>
          </section>
        </div>
      ) : null}
    </section>
  );
}
