import styles from "./legal-workspace.module.css";

type Section = {
  id: string;
  section_number?: string | number | null;
  title?: string | null;
};

type LegalSectionRailProps = {
  draftMode: boolean;
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  onAddSection: () => void;
  onMoveSection: (id: string, direction: "up" | "down") => void;
  onArchiveSection: (id: string) => void;
  sections: Section[];
};

export function LegalSectionRail({
  draftMode,
  selectedSectionId,
  onSelectSection,
  onAddSection,
  onMoveSection,
  onArchiveSection,
  sections = [],
}: LegalSectionRailProps) {
  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <nav className={styles.rail} aria-label="Agreement sections">
      <div className={styles.railHeader}>
        <div className={styles.railHeaderRow}>
          <p className={styles.panelLabel}>Sections</p>
          {draftMode ? (
            <button className={styles.miniButton} type="button" onClick={onAddSection}>
              Add
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.railScroll}>
        <div className={styles.sectionList}>
          {safeSections.map((section, index) => (
            <div key={section.id} className={styles.sectionRailItem}>
              <button
                className={
                  section.id === selectedSectionId
                    ? styles.sectionButtonActive
                    : styles.sectionButton
                }
                type="button"
                onClick={() => onSelectSection(section.id)}
              >
                <span className={styles.sectionNumber}>
                  {section.section_number ?? "—"}
                </span>
                <span>{section.title ?? "Untitled Section"}</span>
              </button>

              {draftMode ? (
                <div className={styles.sectionRailActions}>
                  <button
                    className={styles.iconButton}
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMoveSection(section.id, "up")}
                    aria-label="Move section up"
                  >
                    ↑
                  </button>
                  <button
                    className={styles.iconButton}
                    type="button"
                    disabled={index === safeSections.length - 1}
                    onClick={() => onMoveSection(section.id, "down")}
                    aria-label="Move section down"
                  >
                    ↓
                  </button>
                  <button
                    className={styles.iconButtonDanger}
                    type="button"
                    disabled={safeSections.length <= 1}
                    onClick={() => onArchiveSection(section.id)}
                    aria-label="Archive section"
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.railFooter}>
        {safeSections.length} section{safeSections.length === 1 ? "" : "s"} loaded
      </div>
    </nav>
  );
}
