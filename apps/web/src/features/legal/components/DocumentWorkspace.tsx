"use client";

import { useMemo, useState } from "react";

import { EditorialNotesPanel } from "./EditorialNotesPanel";
import { LegalEditorPane } from "./LegalEditorPane";
import { LegalSectionRail } from "./LegalSectionRail";
import { LegalToolbar } from "./LegalToolbar";
import { RevisionHistoryPanel } from "./RevisionHistoryPanel";
import styles from "./legal-workspace.module.css";

function documentValue(document: unknown, key: "title" | "status" | "version") {
  if (!document || typeof document !== "object") return null;
  const value = (document as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

type LegalSection = {
  id: string;
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
  const safeSections = useMemo(
    () => (Array.isArray(sections) ? sections : []),
    [sections]
  );

  const [selectedSectionId, setSelectedSectionId] = useState(() => {
    return Array.isArray(sections) ? sections[0]?.id ?? "" : "";
  });

  const selectedSection = useMemo(() => {
    return (
      safeSections.find((section) => section.id === selectedSectionId) ??
      safeSections[0] ??
      null
    );
  }, [safeSections, selectedSectionId]);

  const [draftMode, setDraftMode] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const documentTitle = documentValue(document, "title") ?? "Document";

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
        <div className={styles.emptyState}>No sections loaded</div>
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

      <div className={styles.body}>
        <LegalSectionRail
          selectedSectionId={selectedSection.id}
          onSelectSection={setSelectedSectionId}
          sections={safeSections}
        />

        <LegalEditorPane
          key={selectedSection.id}
          draftMode={draftMode}
          section={selectedSection}
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
