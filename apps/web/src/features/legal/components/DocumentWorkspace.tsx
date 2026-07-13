"use client";

import { useMemo, useState } from "react";

import { EditorialNotesPanel } from "./EditorialNotesPanel";
import { LegalEditorPane } from "./LegalEditorPane";
import { LegalSectionRail } from "./LegalSectionRail";
import { LegalToolbar } from "./LegalToolbar";
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

type DocumentWorkspaceProps = {
  document?: unknown;
  sections?: LegalSection[] | null;
  exitHref?: string;
};

export function DocumentWorkspace({
  document = null,
  sections,
  exitHref = "/teamoptix/business/contracts",
}: DocumentWorkspaceProps) {
  const [sectionRows, setSectionRows] = useState<LegalSection[]>(() => {
    return Array.isArray(sections) ? sections : [];
  });
  const [selectedSectionId, setSelectedSectionId] = useState(() => {
    return Array.isArray(sections) ? sections[0]?.id ?? "" : "";
  });
  const [draftMode, setDraftMode] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sectionActionState, setSectionActionState] = useState<"idle" | "saving" | "error">("idle");

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

  if (!selectedSection) {
    return (
      <section className={styles.workspace}>
        <LegalToolbar
          document={document}
          draftMode={draftMode}
          exitHref={exitHref}
          onToggleDraft={() => setDraftMode((current) => !current)}
          onOpenReview={() => setReviewOpen(true)}
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
        onToggleDraft={() => setDraftMode((current) => !current)}
        onOpenReview={() => setReviewOpen(true)}
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
          <EditorialNotesPanel sectionId={selectedSection.id} />
          <RevisionHistoryPanel sectionId={selectedSection.id} />
        </aside>
      </div>

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
