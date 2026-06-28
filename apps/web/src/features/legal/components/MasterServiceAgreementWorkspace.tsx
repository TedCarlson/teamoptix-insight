"use client";

import { useMemo, useState } from "react";

import { EditorialNotesPanel } from "./EditorialNotesPanel";
import { LegalEditorPane } from "./LegalEditorPane";
import { LegalSectionRail } from "./LegalSectionRail";
import { LegalToolbar } from "./LegalToolbar";
import { RevisionHistoryPanel } from "./RevisionHistoryPanel";
import styles from "./legal-workspace.module.css";

export function MasterServiceAgreementWorkspace(props: any) {
  const document = props?.document ?? null;

  /**
   * 🔥 HARD NORMALIZATION (no fallback chains in render graph)
   * This removes ALL ESLint ambiguity.
   */
  const safeSections = useMemo(() => {
    const raw = props.sections;

    if (Array.isArray(raw)) return raw;

    const fallback = props.data?.sections;

    return Array.isArray(fallback) ? fallback : [];
  }, [props.sections, props.data?.sections]);

  const first = safeSections[0];

  const [selectedSectionId, setSelectedSectionId] = useState(
    first?.id ?? ""
  );

  const selectedSection = useMemo(() => {
    const match =
      safeSections.find((s) => s.id === selectedSectionId) ?? null;

    return match ?? safeSections[0] ?? null;
  }, [safeSections, selectedSectionId]);

  if (!selectedSection) {
    return (
      <main className={styles.workspace}>
        <LegalToolbar document={document} />
        <div style={{ padding: 24 }}>No sections loaded</div>
      </main>
    );
  }

  return (
    <main className={styles.workspace}>
      <LegalToolbar document={document} />

      <div className={styles.body}>
        <LegalSectionRail
          selectedSectionId={selectedSection.id}
          onSelectSection={setSelectedSectionId}
          sections={safeSections}
        />

        <LegalEditorPane section={selectedSection} />

        <aside className={styles.inspector}>
          <EditorialNotesPanel sectionId={selectedSection.id} />
          <RevisionHistoryPanel sectionId={selectedSection.id} />
        </aside>
      </div>
    </main>
  );
}
