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

  const sections =
    props?.sections ??
    props?.data?.sections ??
    [];

  const safeSections = Array.isArray(sections) ? sections : [];

  const first = safeSections[0];

  const [selectedSectionId, setSelectedSectionId] = useState(
    first?.id ?? ""
  );

  const selectedSection = useMemo(() => {
    return (
      safeSections.find((s) => s.id === selectedSectionId) ??
      safeSections[0] ??
      null
    );
  }, [safeSections, selectedSectionId]);

  if (!selectedSection) {
    return (
      <main className="workspace-shell">
        <LegalToolbar document={document} />
        <div style={{ padding: 24 }}>No sections loaded</div>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <LegalToolbar document={document} />

      <div className="workspace-main">
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
