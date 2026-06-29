"use client";

import { useMemo, useState } from "react";

import { EditorialNotesPanel } from "./EditorialNotesPanel";
import { LegalEditorPane } from "./LegalEditorPane";
import { LegalSectionRail } from "./LegalSectionRail";
import { LegalToolbar } from "./LegalToolbar";
import { RevisionHistoryPanel } from "./RevisionHistoryPanel";
import styles from "./legal-workspace.module.css";

type LegalSection = {
  id: string;
  section_number?: string | number | null;
  title?: string | null;
  body_markdown?: string | null;
};

type MasterServiceAgreementWorkspaceProps = {
  document?: unknown;
  sections?: LegalSection[] | null;
};

export function MasterServiceAgreementWorkspace({
  document = null,
  sections,
}: MasterServiceAgreementWorkspaceProps) {
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

  if (!selectedSection) {
    return (
      <section className={styles.workspace}>
        <LegalToolbar
          document={document}
          draftMode={draftMode}
          onToggleDraft={() => setDraftMode((current) => !current)}
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
        onToggleDraft={() => setDraftMode((current) => !current)}
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
    </section>
  );
}
